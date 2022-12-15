const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX

exports.handler = async (event) => {

    try {
        const {pathParameters: {index}, headers, queryStringParameters} = event

        if(!index) {
            throw new Error('index is required')
        }

        let indx = `${shadow_prefix}-${index}`
        let {thingIndexingConfiguration: { filter : { namedShadowNames} }} = await iot.getIndexingConfiguration().promise()
        let nshadows = namedShadowNames.filter((shadow) => indx != shadow)
        let removeIndex = await iot.updateIndexingConfiguration({
            thingIndexingConfiguration: {
                thingIndexingMode: 'REGISTRY_AND_SHADOW',
                namedShadowIndexingMode: 'ON',
                filter: { namedShadowNames: nshadows}
            }
        }).promise()

        const response = {
            statusCode: 200,
            body: JSON.stringify({
                message: `Index ${index} successfully deleted`
            }),
        }
        return response

    }
    catch(e) {
        const response = {
            statusCode: 500,
            body: JSON.stringify({message: e.message}),
        }
        console.log(e)
        return response
    }
}