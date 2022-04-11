import { NestedStack, NestedStackProps } from 'aws-cdk-lib'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import { Parameters } from '../../../parameters'
import { StfIotApi } from './stf-iot-api'
import { StfIotCore } from './stf-iot-core'
import { StfIotDataLake } from './stf-iot-datalake'

export interface StfIotStackProps extends NestedStackProps {
  dns_context_broker: string,
  vpc: Vpc
}

export class StfIotStack extends NestedStack {
  public readonly iot_api_endpoint: string
  public readonly iot_sqs_endpoint_arn : string
  constructor(scope: Construct, id: string, props: StfIotStackProps) {
    super(scope, id, props)

    // Deploy the core stack STF IoT 
    const stf_iot_core_construct = new StfIotCore(this, 'Core', {
      vpc: props.vpc, 
      dns_context_broker: props.dns_context_broker
    })

    // Deploy the STF IoT API for Device management 
    const stf_iot_api_construct= new StfIotApi(this, 'Api')

    // Deploy the STF IoT DataLake 
    const stf_iot_datalake_construct = new StfIotDataLake(this, 'DataLake', {
      sns_stf_iot_arn: stf_iot_core_construct.sns_stf_iot.topicArn
    })

    this.iot_api_endpoint = stf_iot_api_construct.iot_api_endpoint
    this.iot_sqs_endpoint_arn = stf_iot_core_construct.sqs_stf_iot_arn
  }
}
