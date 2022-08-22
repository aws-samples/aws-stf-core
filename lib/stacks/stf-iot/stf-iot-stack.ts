import { Aws, NestedStack, NestedStackProps } from 'aws-cdk-lib'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'
import { Parameters } from '../../../parameters'
import { StfIotApi } from './stf-iot-api'
import { StfIotCore } from './stf-iot-core'

export interface StfIotStackProps extends NestedStackProps {
  dns_context_broker: string,
  vpc: Vpc, 
  api_ref: string 
}

export class StfIotStack extends NestedStack {
  // public readonly iot_api_endpoint: string
  public readonly iot_sqs_endpoint_arn : string
  constructor(scope: Construct, id: string, props: StfIotStackProps) {
    super(scope, id, props)

    /*
    *  CREATE STF IoT DATALAKE BUCKET 
    */

    const bucket_name = `stf-iot-datalake-${Aws.REGION}-${Aws.ACCOUNT_ID}`

    // IF BUCKET ALREADY EXISTS, UNCOMMENT BELOW AND COMMENT IoT BUCKET CREATION
    //const bucket = Bucket.fromBucketArn(this, 'IoTBucket', bucket_name)

    // IoT BUCKET CREATION - COMMENT BELOW IF BUCKET ALREADY EXISTS AND UNCOMMENT ABOVE
    const bucket = new Bucket(this, 'BucketStfIotDataLake', { bucketName: bucket_name})



    // DEPLOY THE CORE OF STF IoT 
    const stf_iot_core_construct = new StfIotCore(this, 'Core', {
      vpc: props.vpc, 
      dns_context_broker: props.dns_context_broker,
      bucket_arn: bucket.bucketArn
    })

    // DEPLOY THE STF IoT API DEVICE MANAGEMENT
    const stf_iot_api_construct= new StfIotApi(this, 'Api', {
      api_ref: props.api_ref,
      vpc: props.vpc, 
      dns_context_broker: props.dns_context_broker
    })



    // this.iot_api_endpoint = stf_iot_api_construct.iot_api_endpoint
    this.iot_sqs_endpoint_arn = stf_iot_core_construct.sqs_stf_iot_arn
  }
}
