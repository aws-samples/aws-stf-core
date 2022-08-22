const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX

exports.handler = async (event) => {

    try { 
        const { headers, queryStringParameters} = event
        let nToken = headers?.['nextToken'] ? headers['nextToken'] : null

        let {things, nextToken} = await iot.searchIndex({
            nextToken: nToken,
            queryString: `shadow.name.${shadow_prefix}-Device.reported.type:Device`,
            indexName: 'AWS_Things'
        }).promise()

        let tgs = things.reduce((prev, curr) => { 
            return [ ...prev, 
                    { thingName: curr.thingName, 
                      thingGroupNames: curr.thingGroupNames, 
                      thingTypeName: curr.thingTypeName, 
                      entity: {...JSON.parse(curr.shadow).name[`${shadow_prefix}-Device`].reported}
                    }
            ]
        }, [])
        const response = {
            statusCode: 200,
            body: JSON.stringify({
                nextToken, 
                things: tgs
            }),
        }


        return response

    }  catch(e){
        let statusCode = e.statusCode ? e.statusCode : 500
        const response = {
            statusCode,
            body: JSON.stringify({message: e.message}),
        }
        console.log(e)
        return response
    }
}