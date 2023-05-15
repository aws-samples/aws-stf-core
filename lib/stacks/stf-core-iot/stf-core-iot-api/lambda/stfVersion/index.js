const axios = require('axios')
const CONTEXT_BROKER = process.env.CONTEXT_BROKER
const STF_VERSION = process.env.STF_VERSION


exports.handler = async (event) => {

    try {

        const {headers : {Host}} = event
        let path
        if(CONTEXT_BROKER == "Orion"){
            path = `ngsi-ld/ex/v1/version`
        } else if (CONTEXT_BROKER == "Scorpio") {
            path = `actuator/info`
        } else {
            throw new Error(`${CONTEXT_BROKER} is an invalid value for Context Broker`)
        }
        let url = `https://${Host}/${path}`
        console.log(url)
        let {data} = await axios.get(url)

        let result = {
            "stf_version": STF_VERSION, 
            "context_broker": CONTEXT_BROKER, 
            "context_broker_info": data
        }

        const response = {
            statusCode: 200,
            body: JSON.stringify(result),
        }
        console.log(response)

        return response

        
    } catch (e) {
        const response = {
            statusCode: 500,
            body: JSON.stringify({message: e.message}),
        }
        console.log(e)
        return response
    }

}