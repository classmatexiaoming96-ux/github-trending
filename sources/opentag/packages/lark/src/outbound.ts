import * as lark from "@larksuiteoapi/node-sdk";
import { createLarkTextMessageContent } from "./render.js";

// Minimal client surface OpenTag uses; lark.Client satisfies it structurally.
export type LarkReplyClient = {
  im: {
    message: {
      reply(payload: {
        path: { message_id: string };
        data: { content: string; msg_type: string; reply_in_thread?: boolean; uuid?: string };
      }): Promise<unknown>;
    };
  };
};

export function createLarkReplyClient(input: { appId: string; appSecret: string; domain?: "lark" | "feishu" }): LarkReplyClient {
  return new lark.Client({
    appId: input.appId,
    appSecret: input.appSecret,
    domain: input.domain === "feishu" ? lark.Domain.Feishu : lark.Domain.Lark
  });
}

export async function replyLarkMessage(client: LarkReplyClient, input: { messageId: string; text: string }): Promise<void> {
  await client.im.message.reply({
    path: { message_id: input.messageId },
    data: { content: createLarkTextMessageContent(input.text), msg_type: "text", reply_in_thread: true }
  });
}
