const aws = require('aws-sdk')
const ec2 = new aws.EC2({apiVersion: '2016-11-15'})
const compatible_azs = JSON.parse(process.env.COMPATIBLE_AZS)

exports.handler = async (event) => {
    console.log(event)
    let request_type = event['RequestType']
    if (request_type=='Create' || request_type == 'Update') {
        const {AvailabilityZones} = await ec2.describeAvailabilityZones({}).promise()
        console.log(AvailabilityZones)
        let final_azs =  AvailabilityZones.filter((az) => compatible_azs.includes(az.ZoneId)).map((az) => az.ZoneName)
        console.log({final_azs})
        console.log({compatible_azs})
        return {
            Data: {
                az1: final_azs[0],
                az2: final_azs[final_azs.length - 1]
            }
        }
    }


}