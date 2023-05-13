import { Aws, CfnOutput, NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { Parameters } from "../../../parameters";
import { StfCoreApiGateway } from "../stf-core-constructs/apigateway";
import { StfCoreScorpioDatabase } from "./database";
import { StfCoreScorpioFargate } from "./fargate";
import { StfCoreScorpioKafka } from "./kafka";
import { StfCoreNetworking } from "../stf-core-constructs/networking";
import { StfCoreSecret } from "../stf-core-constructs/secret";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";


export interface StfCoreScorpioProps extends NestedStackProps{
  vpc: Vpc,
  secret: Secret
}

export class StfCoreScorpio extends NestedStack {
  public readonly dns_context_broker: string;
  public readonly vpc: Vpc;
  public readonly broker_api_endpoint: string;
  public readonly api_ref: string;

  constructor(scope: Construct, id: string, props: StfCoreScorpioProps) {
    super(scope, id, props);

    const database_construct = new StfCoreScorpioDatabase(this, "DatabaseStack", {
      vpc: props.vpc,
      secret_arn: props.secret.secretArn,
    });

    const kafka_construct = new StfCoreScorpioKafka(this, "KafkaStack", {
      vpc: props.vpc,
    });

    const fargate_construct = new StfCoreScorpioFargate(
      this,
      "FargateStack",
      {
        vpc: props.vpc,
        sg_kafka: kafka_construct.sg_kafka,
        sg_database: database_construct.sg_database,
        secret_arn: props.secret.secretArn,
        db_endpoint: database_construct.database_endpoint,
        db_port: database_construct.database_port,
        kafka_brokers: kafka_construct.kafka_brokers,
        image_context_broker: Parameters.stf_scorpio.image_context_broker,
      }
    );
    fargate_construct.node.addDependency(kafka_construct)
    fargate_construct.node.addDependency(database_construct)

    const api_stack = new StfCoreApiGateway(this, "Api", {
      vpc: props.vpc,
      fargate_alb: fargate_construct.fargate_alb,
    });

    new CfnOutput(this, "stf_endpoint", {
      value: `https://${api_stack.api_ref}.execute-api.${Aws.REGION}.amazonaws.com`,
    });

    this.broker_api_endpoint = `https://${api_stack.api_ref}.execute-api.${Aws.REGION}.amazonaws.com`;
    this.dns_context_broker =
      fargate_construct.fargate_alb.loadBalancer.loadBalancerDnsName;
    this.vpc = props.vpc;
    this.api_ref = api_stack.api_ref;

    new CfnOutput(this, "fargate_alb", {
      value: fargate_construct.fargate_alb.loadBalancer.loadBalancerDnsName,
    });
  }
}
