import { Aws, NestedStack, NestedStackProps } from 'aws-cdk-lib'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'
import { Parameters } from '../../../parameters'
import { StfIotApi } from './stf-core-iot-api'
import { StfIotCore } from './stf-core-iot'

export interface StfIotStackProps extends NestedStackProps {
  dns_context_broker: string,
  vpc: Vpc, 
  api_ref: string 
}

export class StfIotStack extends NestedStack {

  public readonly iot_sqs_endpoint_arn : string

  constructor(scope: Construct, id: string, props: StfIotStackProps) {
    super(scope, id, props)

    /*
    *  CREATE STF IoT DATALAKE BUCKET 
    */

    // DEFAULT BUCKET NAME
    const bucket_name = Parameters.stf_iot.bucket_name
    let bucket
    if (Parameters.stf_iot.new_bucket) {
       bucket = new Bucket(this, 'BucketStfIotDataLake', { bucketName: bucket_name})
    } else {
       bucket = Bucket.fromBucketName(this, 'IoTBucket', bucket_name)
    }

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
