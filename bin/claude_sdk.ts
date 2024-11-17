#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ClaudeSdkStack } from '../lib/claude_sdk-stack';
//test
const app = new cdk.App();
new ClaudeSdkStack(app, 'ClaudeSdkStack', {
});