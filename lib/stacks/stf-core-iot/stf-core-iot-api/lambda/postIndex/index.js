const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX

exports.handler = async (event) => {

    try {

        const body = JSON.parse(event.body)
        let payload = body

        if(!payload.index){
            throw new Error('index property is required.')
        }

        if(!Array.isArray(payload.index)){
            throw new Error('index must be an array.')
        }

        let indx = payload.index.map((el) => el.replace('Stf-', ''))
        indx = indx.map((index => `${shadow_prefix}-${index}`))

        let {thingIndexingConfiguration: { filter : { namedShadowNames} }} = await iot.getIndexingConfiguration().promise()
        let nshadows = [...new Set([...namedShadowNames, ...indx])]  
        console.log(nshadows)
        // update index 
        let updateIndex = await iot.updateIndexingConfiguration({
            thingIndexingConfiguration: {
                    thingIndexingMode: 'REGISTRY_AND_SHADOW',
                    namedShadowIndexingMode: 'ON',
                    filter: { namedShadowNames: nshadows}
                }
        }).promise()
        console.log({updateIndex})
        const response = {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Index successfully updated. The index is now: ${JSON.stringify(nshadows.map((el) => el.replace('Stf-', '')))}`
            }),
        }

        return response
    
    }
    catch(e) {
        const response = {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({message: e.message}),
        }
        console.log(e)
        return response
    }
}