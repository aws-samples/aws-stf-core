const axios = require('axios')
const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX
const dns_broker = `http://${process.env.DNS_CONTEXT_BROKER}/ngsi-ld/v1`
const timeout = parseInt(process.env.TIMEOUT)

exports.handler = async (event) => {

    try { 
        const {pathParameters: {thingName}, headers, queryStringParameters} = event

        console.log(queryStringParameters?.['recursive'])
        if(!thingName) {
            throw new Error('thingName is required')
        }
        if (queryStringParameters?.['recursive'] == 'false'){
            await iotdata.deleteThingShadow({ thingName, shadowName: `${shadow_prefix}-Device` }).promise()
            try {
                let delete_entity = await axios.delete(`${dns_broker}/entities/urn:ngsi-ld:Device:${thingName}`)
            } catch (e) {
                console.log(e.message)
            }
        } else {
            const {results} = await iotdata.listNamedShadowsForThing({ thingName }).promise()
            for await (let shadowName of results){
                if(shadowName.startsWith(shadow_prefix)){
                    await iotdata.deleteThingShadow({ thingName, shadowName}).promise()
                    try {
                        let delete_entity = await axios.delete(`${dns_broker}/entities/urn:ngsi-ld:${shadowName.split(shadow_prefix)[1].split('-')[1]}:${thingName}`)       
                    } catch (e) {
                        console.log(e.message)
                    }
                    
                }
            }
        }
        await iot.deleteThing({thingName}).promise()

        let add = 'and all its associated entities'
        if(queryStringParameters?.['recursive'] == 'false'){
            add =''
        }

        let msg = `Successfully deleted the thing ${thingName} ${add}`

        const response = {
            statusCode: 200,
            body: JSON.stringify({message: msg}),
        }
        return response
    }
    catch(e){
        const response = {
            statusCode: 500,
            body: JSON.stringify({message: e.message}),
        }
        console.log(e)
        return response
    }
}