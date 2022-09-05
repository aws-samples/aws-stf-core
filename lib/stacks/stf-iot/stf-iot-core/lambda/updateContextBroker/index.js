const axios = require('axios')
const aws = require('aws-sdk')
const iot_endpoint = process.env.AWSIOTENDPOINT 
const iot_region = process.env.AWSIOTREGION 
const iotdata = new aws.IotData({endpoint: iot_endpoint, region: iot_region})
const shadow_prefix = process.env.SHADOW_PREFIX
const dns_broker = `http://${process.env.DNS_CONTEXT_BROKER}/ngsi-ld/v1`
const timeout = parseInt(process.env.TIMEOUT)
const URL_SMART_DATA_MODEL = process.env.URL_SMART_DATA_MODEL


exports.handler = async (event, context) => {
    try {
        for await (let msg of event.Records){

            let payload = JSON.parse(msg.body)
            const thingName = `${payload.id.split(':').slice(-1)}`
          
            if(!payload.id || !payload.type){
                throw new Error('Invalid entity - id or type is missing')
            }
            
            // Check if location property is in the payload. If not, get it from the Stf-Device named shadow 
            if(!payload.location && payload.type != 'Device') {
                
                try {
                    let {payload : device_shadow} = await iotdata.getThingShadow({
                        thingName: thingName,
                        shadowName: `${shadow_prefix}-Device`
                    }).promise()

                    device_shadow = JSON.parse(device_shadow)
                    payload.location = device_shadow.state.reported.location

                    if(payload.location){
                        const shadow_payload = {
                            state: {
                                reported: payload
                            }
                        }
                        let updateThingShadow = await iotdata.updateThingShadow({
                            payload: JSON.stringify(shadow_payload), 
                            thingName: thingName, 
                            shadowName: `${shadow_prefix}-${payload.type}`
                        }).promise()
                    }



                } catch (e) {
                    console.log(e.message)
                }
            }
            const entity_id = payload.id
            const entity_type = payload.type
            delete payload.id
            delete payload.type

            if (payload.raw) delete payload.raw

            const headers = {
                'Content-Type': 'application/json',
                'Link': `<${URL_SMART_DATA_MODEL}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
                }
            try {
                console.log('update broker')
                console.log(dns_broker)
                let update_entity = await axios.post(`${dns_broker}/entities/${entity_id}/attrs`, payload, {headers: headers, timeout: timeout})
                console.log(update_entity)   
 
            } catch (e) {
                console.log(e)
                if (e.response){
                    if (e.response.status == 404){
                        console.log(`entity ${entity_id} not found`)
                        try {
                            payload.id = entity_id
                            payload.type = entity_type
                            console.log(payload)
                            let create_entity = await axios.post(`${dns_broker}/entities`, payload, {headers: headers, timeout: timeout})
                            console.log(create_entity.status)
                            console.log(`entity ${entity_id} created`)
                        } catch (e) {
                            log_error(event,context, e.message, e)
                        }
                    }
                } else {
                    log_error(event,context, e.message, e)
                }     
            }
        }
    } catch (e) {
        log_error(event,context, e.message, e)
    }
}


const log_error = (event, context, message, error) => {
    console.error(JSON.stringify({
        message: message,
        event: event,
        error: error, 
        context: context
    }))
}

