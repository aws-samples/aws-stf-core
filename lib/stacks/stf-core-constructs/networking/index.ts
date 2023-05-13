import { CfnSubnet, Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs"
import { Parameters } from "../../../../parameters"
import { Aws, CfnOutput, Fn, Lazy, Stack } from "aws-cdk-lib";

export interface StfCoreNetworkingProps {
  az1: string,
  az2: string
}

export class StfCoreNetworking extends Construct {
  public readonly vpc: Vpc;
  public readonly sg_scorpio_fg: SecurityGroup;
  public readonly sg_kafka: SecurityGroup;
  public readonly sg_aurora: SecurityGroup;

  constructor(scope: Construct, id: string, props: StfCoreNetworkingProps) {
    super(scope, id)
    const stack = Stack.of(this)
    let broker_id = Parameters.stf_broker
    // VPC
    const vpc = new Vpc(this, `VpcStfCore${broker_id}`, {
      natGateways: 1,
      availabilityZones: [`${props.az1}`,`${props.az2}`],

      subnetConfiguration: [
        {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          name: `${broker_id}BrokerSubnetPrivateWithNat`,
          
        },
        {
          subnetType: SubnetType.PRIVATE_ISOLATED,
          name: `${broker_id}BrokerSubnetPrivateIsolated`,
        },
        {
          subnetType: SubnetType.PUBLIC,
          name: `${broker_id}BrokerSubnetPublic`,
        },
      ],
    })


    this.vpc = vpc;
  }
}
