import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StfCoreSecret } from "./secret";
import { StfCoreNetworking } from "./networking";
import { Utils } from "./utils";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export class StfCoreConstructs extends NestedStack {
  public readonly vpc: Vpc;
  public readonly secret: Secret;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    const utils_construct = new Utils(this, "util")
    const secret_construct = new StfCoreSecret(this, "Secret", {})
    const networking_construct = new StfCoreNetworking(this, "Networking", {
      az1: utils_construct.az1,
      az2: utils_construct.az2
    })

    networking_construct.node.addDependency(utils_construct)

    this.vpc = networking_construct.vpc;
    this.secret = secret_construct.secret;
  }
}
