import { NestedStack, NestedStackProps } from "aws-cdk-lib"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"


export interface StfCoreSecretProps {
}

export class StfCoreSecret extends Construct {
    public readonly secret: Secret

    constructor(scope: Construct, id: string, props: StfCoreSecretProps) {
        super(scope, id)
    
        this.secret = new Secret(this, 'Secret', {
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                  username: 'stfadmin',
                }),
                excludePunctuation: true,
                excludeCharacters: "/¥'%:;{}",
                includeSpace: false,
                generateStringKey: 'password'
              }
        })
    
    }

}