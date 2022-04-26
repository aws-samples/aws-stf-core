export const Parameters = {
    image_context_broker: 'public.ecr.aws/scorpiobroker/scorpio-aio:latest', 
    smart_data_model_url : 'https://raw.githubusercontent.com/smart-data-models/data-models/master/context.jsonld',
    shadow_prefix: "Stf",
    timeout: '0', // Timeout for the API call in the Lambda that sync with context broker. Has to be a string to pass it in env variable  
    iot_api_key: 'my_super_api_key_that_should_be_at_least_20_characters',// key for the IoT Device management API. +20 characters. To use with x-api-key: 'your_api_key' in the headers
}