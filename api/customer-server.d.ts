/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */


export interface paths {
  "/messagesStatus": {
    /** Get updates on requested messages */
    post: {
      requestBody: {
        content: {
          "application/json": components["schemas"]["MessagesStatusRequest"];
        };
      };
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["MessagesStatusResponse"];
          };
        };
      };
    };
  };
  "/messagesToSign": {
    /** Sign Messages */
    post: {
      /** @description Messages to sign */
      requestBody: {
        content: {
          "application/json": components["schemas"]["MessagesRequest"];
        };
      };
      responses: {
        /** @description Messages Status */
        200: {
          content: {
            "application/json": components["schemas"]["MessagesStatusResponse"];
          };
        };
        default: components["schemas"]["Error"];
      };
    };
  };
}

export type webhooks = Record<string, never>;

export interface components {
  schemas: {
    MessagesStatusRequest: {
      msgIds: string[];
    };
    MessagesStatusResponse: {
      messages: components["schemas"]["MessageStatus"][];
    };
    MessagesRequest: {
      messages: components["schemas"]["MessageEnvelope"][];
    };
    MessageEnvelope: {
      /**
       * Format: uuid
       * @example 9eca83b5-5936-4eef-89cc-51bec0f49945
       */
      msgId: string;
      message: components["schemas"]["Message"];
    };
    MessageStatus: {
      /**
       * Format: uuid
       * @example 8c2b2b3d-fb83-497e-8138-72446b9184b6
       */
      msgId: string;
      /**
       * Format: uuid
       * @example 8c2b2b3d-fb83-497e-8138-72446b9184b6
       */
      txId: string;
      /**
       * @example ECDSA
       * @enum {string}
       */
      status: "PENDING_SIGN" | "SIGNED" | "FAILED";
      errorMessage?: string;
      payload?: string;
    };
    Message: {
      /**
       * Format: uuid
       * @example 8c2b2b3d-fb83-497e-8138-72446b9184b6
       */
      txId: string;
      /**
       * Format: uuid
       * @description keyId that is associated with the HSM private key
       * @example 0ba9efb7-73cc-4ea5-9219-2aed45b06364
       */
      keyId: string;
      /**
       * @description payload to sign
       * @example dc93a3b504f2ede4e03e60758571be627b2512aafa1c5e21db4c6b88d0813e9e
       */
      payload: string;
      /**
       * @description algorithm to sign with
       * @example ECDSA
       * @enum {string}
       */
      algorithm: "ECDSA" | "EDDSA";
    };
    Error: {
      message: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

export type $defs = Record<string, never>;

export type external = Record<string, never>;

export type operations = Record<string, never>;
