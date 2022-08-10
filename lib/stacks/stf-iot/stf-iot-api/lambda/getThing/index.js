const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX

exports.handler = async (event) => {

    try { 
        const {pathParameters: {thingName}, headers, queryStringParameters} = event

        let shadows = null
        if(!thingName) {
            throw new Error('thingName is required')
        }
        if(queryStringParameters && 'shadows' in queryStringParameters) {
            shadows = queryStringParameters['shadows'].split(',').map((shadow) => `${shadow_prefix}-${shadow.trim()}`)

        }
        console.log({queryStringParameters})

        let {results} = await iotdata.listNamedShadowsForThing({ thingName }).promise()

        if(!results.includes(`${shadow_prefix}-Device`)) {
            return {
                statusCode: 404, 
                body: JSON.stringify({
                    message: `${thingName} is not registered in the STF IoT registry.`
                })
            }
        }
        console.log({results})
        if(shadows){
            results = results.filter(result => shadows.includes(result))
        }

        console.log({shadows})
        console.log({results})

        let result = {
            thingName, 
            entities: []
        }

        for await (let shadowName of results) {
          
            let {payload} = await iotdata.getThingShadow({ thingName, shadowName}).promise()
            
            result.entities.push(JSON.parse(payload).state.reported)
        } 

        const response = {
            statusCode: 200,
            body: JSON.stringify(result),
        }
        console.log(response)

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