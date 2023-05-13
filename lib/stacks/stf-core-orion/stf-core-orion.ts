import { Aws, CfnOutput, NestedStack, NestedStackProps } from "aws-cdk-lib"
import { Construct } from "constructs"
import { StfCoreSecret } from "../stf-core-constructs/secret";
import { StfCoreNetworking } from "../stf-core-constructs/networking";
import { StfCoreOrionDatabase } from "./database";
import { StfCoreOrionFargate } from "./fargate";
import { Parameters } from "../../../parameters";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { StfCoreApiGateway } from "../stf-core-constructs/apigateway";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export interface StfCoreOrionProps extends NestedStackProps{
  vpc: Vpc,
  secret: Secret
}

export class StfCoreOrion extends NestedStack {

  public readonly dns_context_broker: string
  public readonly broker_api_endpoint: string
  public readonly api_ref: string

  constructor(scope: Construct, id: string, props: StfCoreOrionProps) {
    super(scope, id, props)


    const database_construct = new StfCoreOrionDatabase(this, "DatabaseStack", {
      vpc: props.vpc,
      secret_arn: props.secret.secretArn,
    })

    const fargate_construct = new StfCoreOrionFargate( this, "FargateStack", {
        vpc: props.vpc,
        sg_database: database_construct.sg_database,
        secret_arn: props.secret.secretArn,
        db_endpoint: database_construct.db_socket_address,
        image_context_broker: Parameters.stf_orion.image_context_broker,
      }
    )

    const api_stack = new StfCoreApiGateway(this, "Api", {
      vpc: props.vpc,
      fargate_alb: fargate_construct.fargate_alb,
    })

    new CfnOutput(this, "stf_endpoint", {
      value: `https://${api_stack.api_ref}.execute-api.${Aws.REGION}.amazonaws.com`,
    })

    this.broker_api_endpoint = `https://${api_stack.api_ref}.execute-api.${Aws.REGION}.amazonaws.com`;
    this.dns_context_broker =
      fargate_construct.fargate_alb.loadBalancer.loadBalancerDnsName;
    this.api_ref = api_stack.api_ref;

    new CfnOutput(this, "fargate_alb", {
      value: fargate_construct.fargate_alb.loadBalancer.loadBalancerDnsName,
    })
  }


}
