const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iot = new aws.Iot({region: iot_region})
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX

exports.handler = async (event) => {

    try { 
        let { headers, queryStringParameters} = event

        let index = 'Device'

        if(queryStringParameters && queryStringParameters['index']) {
            index = queryStringParameters['index']
        }

        // lower case headers
        headers = Object.keys(headers).reduce( (acc, key) => {
            acc[key.toLowerCase()] = headers[key]
            return acc
        }, {})
      
        let nToken = headers?.['nexttoken'] ? headers['nexttoken'] : null

        let {things, nextToken} = await iot.searchIndex({
            nextToken: nToken,
            queryString: `thingName:*`,
            indexName: 'AWS_Things'
        }).promise()

        let tgs = things.reduce((prev, curr) => { 
            return [ ...prev, 
                    { thingName: curr.thingName, 
                      thingGroupNames: curr.thingGroupNames, 
                      thingTypeName: curr.thingTypeName, 
                      entity: {...JSON.parse(curr?.shadow)?.name[`${shadow_prefix}-${index}`]?.reported}
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

        if(e.statusCode == 400){
            let statusCode = e.statusCode ? e.statusCode : 500
            const response = {
                statusCode,
                body: JSON.stringify({message: `Error with the submitted index. Please verify it is a valid index and registered in the STF IoT Index`}),
            } 
        }

        let statusCode = e.statusCode ? e.statusCode : 500
        const response = {
            statusCode,
            body: JSON.stringify({message: e.message}),
        }
        console.log(e)
        return response
    }
}