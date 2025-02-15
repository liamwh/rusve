import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';


type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  proto: {
    AuthRequest: MessageTypeDefinition
    Post: MessageTypeDefinition
    PostId: MessageTypeDefinition
    User: MessageTypeDefinition
    UserRole: EnumTypeDefinition
  }
}

