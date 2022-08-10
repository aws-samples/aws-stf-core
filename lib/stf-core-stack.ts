import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { StfScorpioServerlessStack } from './stacks/scorpio-serverless/stf-scorpio-serverless-stack'
import { StfIotStack } from './stacks/stf-iot/stf-iot-stack'


export class StfCoreStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const serverless_scorpio_stack  = new StfScorpioServerlessStack(this, 'ScorpioServerless')

    const stf_iot_stack  = new StfIotStack(this, 'IoT', {
      dns_context_broker: serverless_scorpio_stack.dns_context_broker, 
      vpc: serverless_scorpio_stack.vpc, 
      api_ref: serverless_scorpio_stack.api_ref
    })

    new CfnOutput(this, 'StfCoreEndpoint', {
      value: serverless_scorpio_stack.broker_api_endpoint
    })

    new CfnOutput(this, 'StfCoreIotQueueArn', {
      value: stf_iot_stack.iot_sqs_endpoint_arn
    })

  }
}
