import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2_authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as path from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';

export class ClaudeSdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Create Cognito User Pool (simplified)
    const userPool = new cognito.UserPool(this, 'ClaudeUserPool', {
      userPoolName: 'claude-sdk-users',
      selfSignUpEnabled: false,
      signInAliases: {
        username: true,
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
    });

    // 2. Create User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'ClaudeUserPoolClient', {
      userPool,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
      },


    });

    // Create Layer
    const dependenciesLayer = new lambda.LayerVersion(this, 'DependenciesLayer', {
      code: lambda.Code.fromAsset('assets/lambdaLayers/anthropic-layer.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'Dependencies for Claude SDK Lambda',
    });
    
    // Create Lambda function
    const claudeFunction = new lambda.Function(this, 'ClaudeFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'main.handler',
      code: lambda.Code.fromAsset('lambda'),
      layers: [dependenciesLayer],
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        SSM_PARAM_CLAUDE_API_KEY: '/claude-sdk/api-key', // SSM parameter name
      },
    });

    // Grant Lambda permission to read SSM parameter
    claudeFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/claude-sdk/api-key`
      ],
    }));

    // 4. Create HTTP API with Cognito Authorizer
    const httpApi = new apigatewayv2.HttpApi(this, 'ClaudeApi');

    // 5. Create Cognito Authorizer
    const authorizer = new apigatewayv2_authorizers.HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
      identitySource: ['$request.header.Authorization'],
    });

    // 6. Add route with Cognito authorization
    httpApi.addRoutes({
      path: '/query',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2_integrations.HttpLambdaIntegration(
        'ClaudeIntegration',
        claudeFunction
      ),
      authorizer,
    });

    // 7. Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url ?? 'Something went wrong',
    });
  }
}