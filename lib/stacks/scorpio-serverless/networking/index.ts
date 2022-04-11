import { Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs"

export interface ScorpioServerlessNetworkingProps{
}

export class ScorpioServerlessNetworking extends Construct{

    public readonly vpc: Vpc
    public readonly sg_scorpio_fg: SecurityGroup
    public readonly sg_kafka: SecurityGroup
    public readonly sg_aurora: SecurityGroup

    constructor(scope: Construct, id: string, props: ScorpioServerlessNetworkingProps ) {
        super(scope, id)

        // VPC 
        const vpc = new Vpc(this, 'VpcStfScorpioServerless', {
            subnetConfiguration: [
                {
                    subnetType: SubnetType.PRIVATE_WITH_NAT,
                    name: 'scorpioSubnetPrivateWithNat'
                },
                {
                    subnetType: SubnetType.PRIVATE_ISOLATED,
                    name: 'scorpioSubnetPrivateIsolated'
                },
                {
                    subnetType: SubnetType.PUBLIC,
                    name: 'ScorpioSubnetPublic'
                }
            ]
        })
        this.vpc = vpc
    }
}