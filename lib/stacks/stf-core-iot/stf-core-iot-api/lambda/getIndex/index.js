const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX

exports.handler = async (event) => {

    try { 
        let {thingIndexingConfiguration: { filter : { namedShadowNames} }} = await iot.getIndexingConfiguration().promise()
        const response = {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                index: namedShadowNames.map((el) => el.replace('Stf-', ''))
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