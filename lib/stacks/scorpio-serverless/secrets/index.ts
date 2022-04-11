import { NestedStack, NestedStackProps } from "aws-cdk-lib"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"


export interface ScorpioServerlessSecretsProps{
}

export class ScorpioServerlessSecret extends Construct {
    public readonly secret: Secret

    constructor(scope: Construct, id: string, props: ScorpioServerlessSecretsProps) {
        super(scope, id)
    
        this.secret = new Secret(this, 'Secret', {
            // secretName: 'stf-aurora-secret', 
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                  username: 'stfaurora',
                }),
                excludePunctuation: true,
                includeSpace: false,
                generateStringKey: 'password'
              }
        })
    
    }

}