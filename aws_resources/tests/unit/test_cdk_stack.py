import aws_cdk as core
import aws_cdk.assertions as assertions

from cdk.cdk_stack import CdkStack
from cdk.shared_stack import SharedPersistentStack

# example tests. To run these tests, uncomment this file along with the example
# resource in cdk/cdk_stack.py
def test_sqs_queue_created():
    app = core.App()
    env = core.Environment(account="123456789012", region="us-east-1")
    shared = SharedPersistentStack(app, "shared", env=env)
    stack = CdkStack(app, "cdk", env=env, shared_persistent_stack=shared)
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })