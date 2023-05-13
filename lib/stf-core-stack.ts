import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { StfCoreScorpio } from './stacks/stf-core-scorpio/stf-core-scorpio'
import { StfIotStack } from './stacks/stf-core-iot/stf-core-iot-stack'
import { Parameters } from '../parameters'
import { StfCoreOrion } from './stacks/stf-core-orion/stf-core-orion'
import { StfCoreConstructs } from './stacks/stf-core-constructs/stf-core-constructs'


export class StfCoreStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    let stf_broker_stack;
    let stf_iot_stack;

    const stf_core_constructs = new StfCoreConstructs(this, 'CommonContructs')

    if(Parameters.stf_broker == "Scorpio") {
      stf_broker_stack = new StfCoreScorpio(this, 'Scorpio', {
        vpc: stf_core_constructs.vpc, 
        secret: stf_core_constructs.secret
      })
      stf_iot_stack  = new StfIotStack(this, 'IoT', {
        dns_context_broker: stf_broker_stack.dns_context_broker, 
        vpc: stf_core_constructs.vpc, 
        api_ref: stf_broker_stack.api_ref,
      })
    } else if (Parameters.stf_broker == "Orion") {
      stf_broker_stack = new StfCoreOrion(this, 'Orion', {
        vpc: stf_core_constructs.vpc, 
        secret: stf_core_constructs.secret
      })
      stf_iot_stack  = new StfIotStack(this, 'IoT', {
        dns_context_broker: stf_broker_stack.dns_context_broker, 
        vpc: stf_core_constructs.vpc, 
        api_ref: stf_broker_stack.api_ref
      })
    } else {
      throw new Error('Please provide a valid option for the context broker - Orion or Scorpio')
    }


    new CfnOutput(this, 'StfCoreEndpoint', {
      value: stf_broker_stack.broker_api_endpoint
    })

    new CfnOutput(this, 'StfCoreIotQueueArn', {
      value: stf_iot_stack.iot_sqs_endpoint_arn
    })

    

  }
}
