const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX

exports.handler = async (event) => {

    try{
        const body = JSON.parse(event.body)
        
        let payload = body



        let groups = body.thingGroups?.value

        if (groups) {
            if(!Array.isArray(groups)) {
                throw new Error('Invalid thingGroups property. The type must be property and value must be an array')
            }
    
            if(groups.length > 10){
                throw new Error('A thing can be added to a maximum of 10 thing groups')
            }
        }

        if(!payload.id || !payload.type || !payload.location) {
            throw new Error('id, type and location are required')
        }

        if(payload.type != 'Device'){
            throw new Error('Invalid type. The value of type must be Device and compliant with Smart Data Models - Device')
        }

        if(!payload.id.startsWith('urn:ngsi-ld:Device:')){
            throw new Error('Invalid id. The id must start with urn:ngsi-ld:Device: following with thingName')
        }



        // Get the thingName from the id
        const thingName = `${payload.id.split(':').slice(-1)}`

        if(!thingName){
            throw new Error('Invalid thingName')
        }
 
        // Create the thing
        const thing_in_registry = await iot.createThing({ thingName: thingName }).promise()

        // if a group is specified
        if(groups && groups.length > 0){
            for await (let group of groups){
                const thing_group = await iot.createThingGroup({thingGroupName: group}).promise()
                const thing_in_group = await iot.addThingToThingGroup({thingName: thingName, thingGroupName: group}).promise()
            }
        }

        console.log(thing_in_registry)

        delete payload.thingGroups

        const shadow_payload = {
            state: {
                reported: payload
            }
        }
        let updateThingShadow = await iotdata.updateThingShadow({payload: JSON.stringify(shadow_payload ), thingName: thingName, shadowName: `${shadow_prefix}-${payload.type}`}).promise()

        let msg = `${thingName} successfully registered`
        if (groups) {
            msg = `${msg} and added to ${JSON.stringify(groups)}`
        }

        const response = {
            statusCode: 200,
            body: JSON.stringify({message: msg}),
        }
        return response
            
    } catch(e){
        const response = {
            statusCode: 500,
            body: JSON.stringify({message: e.message}),
        }
        console.log(e)
        return response
    }
    
    


}
