import json
import os
import boto3
from typing import Dict, Any, Optional, TypedDict
from pydantic import BaseModel, Field
from anthropic import Anthropic

# Initialize SSM client
ssm = boto3.client('ssm')

def get_claude_api_key() -> str:
    """Fetch Claude API key from SSM Parameter Store"""
    response = ssm.get_parameter(
        Name=os.environ['SSM_PARAM_CLAUDE_API_KEY'],
        WithDecryption=True
    )
    return response['Parameter']['Value']

class QueryRequest(BaseModel):
    """Request model for Claude API"""
    prompt: str = Field(..., description="The prompt to send to Claude")
    max_tokens: Optional[int] = Field(default=1024, description="Maximum tokens in response")
    temperature: Optional[float] = Field(default=0.7, description="Temperature for response generation")
    model: Optional[str] = Field(
        default="claude-3-sonnet-20240229",
        description="Claude model to use"
    )

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler for Claude API requests"""
    try:
        # Get API key from SSM
        api_key = get_claude_api_key()
        
        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
            request = QueryRequest(**body)
        except json.JSONDecodeError:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Invalid JSON in request body'})
            }
        except Exception as e:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Invalid request format',
                    'details': str(e)
                })
            }

        # Initialize Claude client
        client = Anthropic(api_key=api_key)
        
        # Query Claude
        try:
            message = client.messages.create(
                model=request.model,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                messages=[
                    {
                        "role": "user",
                        "content": request.prompt
                    }
                ]
            )
        except Exception as e:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Error calling Claude API',
                    'details': str(e)
                })
            }

        # Return successful response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'response': message.content[0].text,
                'usage': {
                    'input_tokens': message.usage.input_tokens,
                    'output_tokens': message.usage.output_tokens
                },
                'model': request.model
            })
        }
    
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal server error',
                'details': str(e)
            })
        }