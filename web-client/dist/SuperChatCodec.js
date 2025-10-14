import { BitStreamEncoder, BitStreamDecoder } from "./BitStream.js";
class StringEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    const value_bytes = new TextEncoder().encode(value);
    this.writeUint16(value_bytes.length, "big_endian");
    for (const byte of value_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class StringDecoder extends BitStreamDecoder {
  constructor(bytes) {
    super(bytes, "msb_first");
  }
  decode() {
    let value = {};
    const result_length = this.readUint16("big_endian");
    const result_bytes = [];
    for (let i = 0; i < result_length; i++) {
      result_bytes.push(this.readUint8());
    }
    value.result = new TextDecoder().decode(new Uint8Array(result_bytes));
    return value.result;
  }
}
class FrameHeaderEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint32(value.length, "big_endian");
    this.writeUint8(value.version);
    this.writeUint8(value.type);
    this.writeUint8(value.flags);
    return this.finish();
  }
}
class FrameHeaderDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.length = this.readUint32("big_endian");
    value.version = this.readUint8();
    value.type = this.readUint8();
    value.flags = this.readUint8();
    return value;
  }
}
class AuthRequestEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    const value_nickname_bytes = new TextEncoder().encode(value.nickname);
    this.writeUint16(value_nickname_bytes.length, "big_endian");
    for (const byte of value_nickname_bytes) {
      this.writeUint8(byte);
    }
    const value_password_bytes = new TextEncoder().encode(value.password);
    this.writeUint16(value_password_bytes.length, "big_endian");
    for (const byte of value_password_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class AuthRequestDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    const nickname_length = this.readUint16("big_endian");
    const nickname_bytes = [];
    for (let i = 0; i < nickname_length; i++) {
      nickname_bytes.push(this.readUint8());
    }
    value.nickname = new TextDecoder().decode(new Uint8Array(nickname_bytes));
    const password_length = this.readUint16("big_endian");
    const password_bytes = [];
    for (let i = 0; i < password_length; i++) {
      password_bytes.push(this.readUint8());
    }
    value.password = new TextDecoder().decode(new Uint8Array(password_bytes));
    return value;
  }
}
class AuthResponseEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint8(value.success);
    this.writeUint8(value.user_id.present);
    if (value.user_id.present == 1 && value.user_id.value !== void 0) {
      this.writeUint64(value.user_id.value, "big_endian");
    }
    this.writeUint8(value.nickname.present);
    if (value.nickname.present == 1 && value.nickname.value !== void 0) {
      const value_nickname_value_bytes = new TextEncoder().encode(value.nickname.value);
      this.writeUint16(value_nickname_value_bytes.length, "big_endian");
      for (const byte of value_nickname_value_bytes) {
        this.writeUint8(byte);
      }
    }
    const value_message_bytes = new TextEncoder().encode(value.message);
    this.writeUint16(value_message_bytes.length, "big_endian");
    for (const byte of value_message_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class AuthResponseDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.success = this.readUint8();
    value.user_id = {};
    value.user_id.present = this.readUint8();
    if (value.user_id.present == 1) {
      value.user_id.value = this.readUint64("big_endian");
    }
    value.nickname = {};
    value.nickname.present = this.readUint8();
    if (value.nickname.present == 1) {
      const nickname_value_length = this.readUint16("big_endian");
      const nickname_value_bytes = [];
      for (let i = 0; i < nickname_value_length; i++) {
        nickname_value_bytes.push(this.readUint8());
      }
      value.nickname.value = new TextDecoder().decode(new Uint8Array(nickname_value_bytes));
    }
    const message_length = this.readUint16("big_endian");
    const message_bytes = [];
    for (let i = 0; i < message_length; i++) {
      message_bytes.push(this.readUint8());
    }
    value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
    return value;
  }
}
class SetNicknameEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    const value_nickname_bytes = new TextEncoder().encode(value.nickname);
    this.writeUint16(value_nickname_bytes.length, "big_endian");
    for (const byte of value_nickname_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class SetNicknameDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    const nickname_length = this.readUint16("big_endian");
    const nickname_bytes = [];
    for (let i = 0; i < nickname_length; i++) {
      nickname_bytes.push(this.readUint8());
    }
    value.nickname = new TextDecoder().decode(new Uint8Array(nickname_bytes));
    return value;
  }
}
class NicknameResponseEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint8(value.success);
    const value_message_bytes = new TextEncoder().encode(value.message);
    this.writeUint16(value_message_bytes.length, "big_endian");
    for (const byte of value_message_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class NicknameResponseDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.success = this.readUint8();
    const message_length = this.readUint16("big_endian");
    const message_bytes = [];
    for (let i = 0; i < message_length; i++) {
      message_bytes.push(this.readUint8());
    }
    value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
    return value;
  }
}
class PostMessageEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.channel_id, "big_endian");
    this.writeUint8(value.subchannel_id.present);
    if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
      this.writeUint64(value.subchannel_id.value, "big_endian");
    }
    this.writeUint8(value.parent_id.present);
    if (value.parent_id.present == 1 && value.parent_id.value !== void 0) {
      this.writeUint64(value.parent_id.value, "big_endian");
    }
    const value_content_bytes = new TextEncoder().encode(value.content);
    this.writeUint16(value_content_bytes.length, "big_endian");
    for (const byte of value_content_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class PostMessageDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.channel_id = this.readUint64("big_endian");
    value.subchannel_id = {};
    value.subchannel_id.present = this.readUint8();
    if (value.subchannel_id.present == 1) {
      value.subchannel_id.value = this.readUint64("big_endian");
    }
    value.parent_id = {};
    value.parent_id.present = this.readUint8();
    if (value.parent_id.present == 1) {
      value.parent_id.value = this.readUint64("big_endian");
    }
    const content_length = this.readUint16("big_endian");
    const content_bytes = [];
    for (let i = 0; i < content_length; i++) {
      content_bytes.push(this.readUint8());
    }
    value.content = new TextDecoder().decode(new Uint8Array(content_bytes));
    return value;
  }
}
class MessagePostedEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint8(value.success);
    this.writeUint8(value.message_id.present);
    if (value.message_id.present == 1 && value.message_id.value !== void 0) {
      this.writeUint64(value.message_id.value, "big_endian");
    }
    const value_message_bytes = new TextEncoder().encode(value.message);
    this.writeUint16(value_message_bytes.length, "big_endian");
    for (const byte of value_message_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class MessagePostedDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.success = this.readUint8();
    value.message_id = {};
    value.message_id.present = this.readUint8();
    if (value.message_id.present == 1) {
      value.message_id.value = this.readUint64("big_endian");
    }
    const message_length = this.readUint16("big_endian");
    const message_bytes = [];
    for (let i = 0; i < message_length; i++) {
      message_bytes.push(this.readUint8());
    }
    value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
    return value;
  }
}
class NewMessageEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.message_id, "big_endian");
    this.writeUint64(value.channel_id, "big_endian");
    this.writeUint8(value.subchannel_id.present);
    if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
      this.writeUint64(value.subchannel_id.value, "big_endian");
    }
    this.writeUint8(value.parent_id.present);
    if (value.parent_id.present == 1 && value.parent_id.value !== void 0) {
      this.writeUint64(value.parent_id.value, "big_endian");
    }
    this.writeUint8(value.author_user_id.present);
    if (value.author_user_id.present == 1 && value.author_user_id.value !== void 0) {
      this.writeUint64(value.author_user_id.value, "big_endian");
    }
    const value_author_nickname_bytes = new TextEncoder().encode(value.author_nickname);
    this.writeUint16(value_author_nickname_bytes.length, "big_endian");
    for (const byte of value_author_nickname_bytes) {
      this.writeUint8(byte);
    }
    const value_content_bytes = new TextEncoder().encode(value.content);
    this.writeUint16(value_content_bytes.length, "big_endian");
    for (const byte of value_content_bytes) {
      this.writeUint8(byte);
    }
    this.writeInt64(value.created_at, "big_endian");
    this.writeUint8(value.edited_at.present);
    if (value.edited_at.present == 1 && value.edited_at.value !== void 0) {
      this.writeInt64(value.edited_at.value, "big_endian");
    }
    this.writeUint8(value.thread_depth);
    this.writeUint32(value.reply_count, "big_endian");
    return this.finish();
  }
}
class NewMessageDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.message_id = this.readUint64("big_endian");
    value.channel_id = this.readUint64("big_endian");
    value.subchannel_id = {};
    value.subchannel_id.present = this.readUint8();
    if (value.subchannel_id.present == 1) {
      value.subchannel_id.value = this.readUint64("big_endian");
    }
    value.parent_id = {};
    value.parent_id.present = this.readUint8();
    if (value.parent_id.present == 1) {
      value.parent_id.value = this.readUint64("big_endian");
    }
    value.author_user_id = {};
    value.author_user_id.present = this.readUint8();
    if (value.author_user_id.present == 1) {
      value.author_user_id.value = this.readUint64("big_endian");
    }
    const author_nickname_length = this.readUint16("big_endian");
    const author_nickname_bytes = [];
    for (let i = 0; i < author_nickname_length; i++) {
      author_nickname_bytes.push(this.readUint8());
    }
    value.author_nickname = new TextDecoder().decode(new Uint8Array(author_nickname_bytes));
    const content_length = this.readUint16("big_endian");
    const content_bytes = [];
    for (let i = 0; i < content_length; i++) {
      content_bytes.push(this.readUint8());
    }
    value.content = new TextDecoder().decode(new Uint8Array(content_bytes));
    value.created_at = this.readInt64("big_endian");
    value.edited_at = {};
    value.edited_at.present = this.readUint8();
    if (value.edited_at.present == 1) {
      value.edited_at.value = this.readInt64("big_endian");
    }
    value.thread_depth = this.readUint8();
    value.reply_count = this.readUint32("big_endian");
    return value;
  }
}
class RegisterUserEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    const value_password_hash_bytes = new TextEncoder().encode(value.password_hash);
    this.writeUint16(value_password_hash_bytes.length, "big_endian");
    for (const byte of value_password_hash_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class RegisterUserDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    const password_hash_length = this.readUint16("big_endian");
    const password_hash_bytes = [];
    for (let i = 0; i < password_hash_length; i++) {
      password_hash_bytes.push(this.readUint8());
    }
    value.password_hash = new TextDecoder().decode(new Uint8Array(password_hash_bytes));
    return value;
  }
}
class RegisterResponseEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint8(value.success);
    this.writeUint8(value.user_id.present);
    if (value.user_id.present == 1 && value.user_id.value !== void 0) {
      this.writeUint64(value.user_id.value, "big_endian");
    }
    return this.finish();
  }
}
class RegisterResponseDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.success = this.readUint8();
    value.user_id = {};
    value.user_id.present = this.readUint8();
    if (value.user_id.present == 1) {
      value.user_id.value = this.readUint64("big_endian");
    }
    return value;
  }
}
class ListChannelsEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.from_channel_id, "big_endian");
    this.writeUint16(value.limit, "big_endian");
    return this.finish();
  }
}
class ListChannelsDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.from_channel_id = this.readUint64("big_endian");
    value.limit = this.readUint16("big_endian");
    return value;
  }
}
class ChannelEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.channel_id, "big_endian");
    const value_name_bytes = new TextEncoder().encode(value.name);
    this.writeUint16(value_name_bytes.length, "big_endian");
    for (const byte of value_name_bytes) {
      this.writeUint8(byte);
    }
    const value_description_bytes = new TextEncoder().encode(value.description);
    this.writeUint16(value_description_bytes.length, "big_endian");
    for (const byte of value_description_bytes) {
      this.writeUint8(byte);
    }
    this.writeUint32(value.user_count, "big_endian");
    this.writeUint8(value.is_operator);
    this.writeUint8(value.type);
    this.writeUint32(value.retention_hours, "big_endian");
    return this.finish();
  }
}
class ChannelDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.channel_id = this.readUint64("big_endian");
    const name_length = this.readUint16("big_endian");
    const name_bytes = [];
    for (let i = 0; i < name_length; i++) {
      name_bytes.push(this.readUint8());
    }
    value.name = new TextDecoder().decode(new Uint8Array(name_bytes));
    const description_length = this.readUint16("big_endian");
    const description_bytes = [];
    for (let i = 0; i < description_length; i++) {
      description_bytes.push(this.readUint8());
    }
    value.description = new TextDecoder().decode(new Uint8Array(description_bytes));
    value.user_count = this.readUint32("big_endian");
    value.is_operator = this.readUint8();
    value.type = this.readUint8();
    value.retention_hours = this.readUint32("big_endian");
    return value;
  }
}
class ChannelListEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint16(value.channel_count, "big_endian");
    for (const value_channels_item of value.channels) {
      this.writeUint64(value_channels_item.channel_id, "big_endian");
      const value_channels_item_name_bytes = new TextEncoder().encode(value_channels_item.name);
      this.writeUint16(value_channels_item_name_bytes.length, "big_endian");
      for (const byte of value_channels_item_name_bytes) {
        this.writeUint8(byte);
      }
      const value_channels_item_description_bytes = new TextEncoder().encode(value_channels_item.description);
      this.writeUint16(value_channels_item_description_bytes.length, "big_endian");
      for (const byte of value_channels_item_description_bytes) {
        this.writeUint8(byte);
      }
      this.writeUint32(value_channels_item.user_count, "big_endian");
      this.writeUint8(value_channels_item.is_operator);
      this.writeUint8(value_channels_item.type);
      this.writeUint32(value_channels_item.retention_hours, "big_endian");
    }
    return this.finish();
  }
}
class ChannelListDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.channel_count = this.readUint16("big_endian");
    value.channels = [];
    const channels_length = value.channel_count ?? this.context?.channel_count;
    if (channels_length === void 0) {
      throw new Error('Field-referenced array length field "channel_count" not found in value or context');
    }
    for (let i = 0; i < channels_length; i++) {
      let channels_item;
      channels_item = {};
      channels_item.channel_id = this.readUint64("big_endian");
      const channels_item_name_length = this.readUint16("big_endian");
      const channels_item_name_bytes = [];
      for (let i2 = 0; i2 < channels_item_name_length; i2++) {
        channels_item_name_bytes.push(this.readUint8());
      }
      channels_item.name = new TextDecoder().decode(new Uint8Array(channels_item_name_bytes));
      const channels_item_description_length = this.readUint16("big_endian");
      const channels_item_description_bytes = [];
      for (let i2 = 0; i2 < channels_item_description_length; i2++) {
        channels_item_description_bytes.push(this.readUint8());
      }
      channels_item.description = new TextDecoder().decode(new Uint8Array(channels_item_description_bytes));
      channels_item.user_count = this.readUint32("big_endian");
      channels_item.is_operator = this.readUint8();
      channels_item.type = this.readUint8();
      channels_item.retention_hours = this.readUint32("big_endian");
      value.channels.push(channels_item);
    }
    return value;
  }
}
class JoinChannelEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.channel_id, "big_endian");
    this.writeUint8(value.subchannel_id.present);
    if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
      this.writeUint64(value.subchannel_id.value, "big_endian");
    }
    return this.finish();
  }
}
class JoinChannelDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.channel_id = this.readUint64("big_endian");
    value.subchannel_id = {};
    value.subchannel_id.present = this.readUint8();
    if (value.subchannel_id.present == 1) {
      value.subchannel_id.value = this.readUint64("big_endian");
    }
    return value;
  }
}
class JoinResponseEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint8(value.success);
    this.writeUint64(value.channel_id, "big_endian");
    this.writeUint8(value.subchannel_id.present);
    if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
      this.writeUint64(value.subchannel_id.value, "big_endian");
    }
    const value_message_bytes = new TextEncoder().encode(value.message);
    this.writeUint16(value_message_bytes.length, "big_endian");
    for (const byte of value_message_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class JoinResponseDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.success = this.readUint8();
    value.channel_id = this.readUint64("big_endian");
    value.subchannel_id = {};
    value.subchannel_id.present = this.readUint8();
    if (value.subchannel_id.present == 1) {
      value.subchannel_id.value = this.readUint64("big_endian");
    }
    const message_length = this.readUint16("big_endian");
    const message_bytes = [];
    for (let i = 0; i < message_length; i++) {
      message_bytes.push(this.readUint8());
    }
    value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
    return value;
  }
}
class ListMessagesEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.channel_id, "big_endian");
    this.writeUint8(value.subchannel_id.present);
    if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
      this.writeUint64(value.subchannel_id.value, "big_endian");
    }
    this.writeUint16(value.limit, "big_endian");
    this.writeUint8(value.before_id.present);
    if (value.before_id.present == 1 && value.before_id.value !== void 0) {
      this.writeUint64(value.before_id.value, "big_endian");
    }
    this.writeUint8(value.parent_id.present);
    if (value.parent_id.present == 1 && value.parent_id.value !== void 0) {
      this.writeUint64(value.parent_id.value, "big_endian");
    }
    this.writeUint8(value.after_id.present);
    if (value.after_id.present == 1 && value.after_id.value !== void 0) {
      this.writeUint64(value.after_id.value, "big_endian");
    }
    return this.finish();
  }
}
class ListMessagesDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.channel_id = this.readUint64("big_endian");
    value.subchannel_id = {};
    value.subchannel_id.present = this.readUint8();
    if (value.subchannel_id.present == 1) {
      value.subchannel_id.value = this.readUint64("big_endian");
    }
    value.limit = this.readUint16("big_endian");
    value.before_id = {};
    value.before_id.present = this.readUint8();
    if (value.before_id.present == 1) {
      value.before_id.value = this.readUint64("big_endian");
    }
    value.parent_id = {};
    value.parent_id.present = this.readUint8();
    if (value.parent_id.present == 1) {
      value.parent_id.value = this.readUint64("big_endian");
    }
    value.after_id = {};
    value.after_id.present = this.readUint8();
    if (value.after_id.present == 1) {
      value.after_id.value = this.readUint64("big_endian");
    }
    return value;
  }
}
class MessageEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.message_id, "big_endian");
    this.writeUint64(value.channel_id, "big_endian");
    this.writeUint8(value.subchannel_id.present);
    if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
      this.writeUint64(value.subchannel_id.value, "big_endian");
    }
    this.writeUint8(value.parent_id.present);
    if (value.parent_id.present == 1 && value.parent_id.value !== void 0) {
      this.writeUint64(value.parent_id.value, "big_endian");
    }
    this.writeUint8(value.author_user_id.present);
    if (value.author_user_id.present == 1 && value.author_user_id.value !== void 0) {
      this.writeUint64(value.author_user_id.value, "big_endian");
    }
    const value_author_nickname_bytes = new TextEncoder().encode(value.author_nickname);
    this.writeUint16(value_author_nickname_bytes.length, "big_endian");
    for (const byte of value_author_nickname_bytes) {
      this.writeUint8(byte);
    }
    const value_content_bytes = new TextEncoder().encode(value.content);
    this.writeUint16(value_content_bytes.length, "big_endian");
    for (const byte of value_content_bytes) {
      this.writeUint8(byte);
    }
    this.writeInt64(value.created_at, "big_endian");
    this.writeUint8(value.edited_at.present);
    if (value.edited_at.present == 1 && value.edited_at.value !== void 0) {
      this.writeInt64(value.edited_at.value, "big_endian");
    }
    this.writeUint8(value.thread_depth);
    this.writeUint32(value.reply_count, "big_endian");
    return this.finish();
  }
}
class MessageDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.message_id = this.readUint64("big_endian");
    value.channel_id = this.readUint64("big_endian");
    value.subchannel_id = {};
    value.subchannel_id.present = this.readUint8();
    if (value.subchannel_id.present == 1) {
      value.subchannel_id.value = this.readUint64("big_endian");
    }
    value.parent_id = {};
    value.parent_id.present = this.readUint8();
    if (value.parent_id.present == 1) {
      value.parent_id.value = this.readUint64("big_endian");
    }
    value.author_user_id = {};
    value.author_user_id.present = this.readUint8();
    if (value.author_user_id.present == 1) {
      value.author_user_id.value = this.readUint64("big_endian");
    }
    const author_nickname_length = this.readUint16("big_endian");
    const author_nickname_bytes = [];
    for (let i = 0; i < author_nickname_length; i++) {
      author_nickname_bytes.push(this.readUint8());
    }
    value.author_nickname = new TextDecoder().decode(new Uint8Array(author_nickname_bytes));
    const content_length = this.readUint16("big_endian");
    const content_bytes = [];
    for (let i = 0; i < content_length; i++) {
      content_bytes.push(this.readUint8());
    }
    value.content = new TextDecoder().decode(new Uint8Array(content_bytes));
    value.created_at = this.readInt64("big_endian");
    value.edited_at = {};
    value.edited_at.present = this.readUint8();
    if (value.edited_at.present == 1) {
      value.edited_at.value = this.readInt64("big_endian");
    }
    value.thread_depth = this.readUint8();
    value.reply_count = this.readUint32("big_endian");
    return value;
  }
}
class MessageListEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint64(value.channel_id, "big_endian");
    this.writeUint8(value.subchannel_id.present);
    if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
      this.writeUint64(value.subchannel_id.value, "big_endian");
    }
    this.writeUint8(value.parent_id.present);
    if (value.parent_id.present == 1 && value.parent_id.value !== void 0) {
      this.writeUint64(value.parent_id.value, "big_endian");
    }
    this.writeUint16(value.message_count, "big_endian");
    for (const value_messages_item of value.messages) {
      this.writeUint64(value_messages_item.message_id, "big_endian");
      this.writeUint64(value_messages_item.channel_id, "big_endian");
      this.writeUint8(value_messages_item.subchannel_id.present);
      if (value_messages_item.subchannel_id.present == 1 && value_messages_item.subchannel_id.value !== void 0) {
        this.writeUint64(value_messages_item.subchannel_id.value, "big_endian");
      }
      this.writeUint8(value_messages_item.parent_id.present);
      if (value_messages_item.parent_id.present == 1 && value_messages_item.parent_id.value !== void 0) {
        this.writeUint64(value_messages_item.parent_id.value, "big_endian");
      }
      this.writeUint8(value_messages_item.author_user_id.present);
      if (value_messages_item.author_user_id.present == 1 && value_messages_item.author_user_id.value !== void 0) {
        this.writeUint64(value_messages_item.author_user_id.value, "big_endian");
      }
      const value_messages_item_author_nickname_bytes = new TextEncoder().encode(value_messages_item.author_nickname);
      this.writeUint16(value_messages_item_author_nickname_bytes.length, "big_endian");
      for (const byte of value_messages_item_author_nickname_bytes) {
        this.writeUint8(byte);
      }
      const value_messages_item_content_bytes = new TextEncoder().encode(value_messages_item.content);
      this.writeUint16(value_messages_item_content_bytes.length, "big_endian");
      for (const byte of value_messages_item_content_bytes) {
        this.writeUint8(byte);
      }
      this.writeInt64(value_messages_item.created_at, "big_endian");
      this.writeUint8(value_messages_item.edited_at.present);
      if (value_messages_item.edited_at.present == 1 && value_messages_item.edited_at.value !== void 0) {
        this.writeInt64(value_messages_item.edited_at.value, "big_endian");
      }
      this.writeUint8(value_messages_item.thread_depth);
      this.writeUint32(value_messages_item.reply_count, "big_endian");
    }
    return this.finish();
  }
}
class MessageListDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.channel_id = this.readUint64("big_endian");
    value.subchannel_id = {};
    value.subchannel_id.present = this.readUint8();
    if (value.subchannel_id.present == 1) {
      value.subchannel_id.value = this.readUint64("big_endian");
    }
    value.parent_id = {};
    value.parent_id.present = this.readUint8();
    if (value.parent_id.present == 1) {
      value.parent_id.value = this.readUint64("big_endian");
    }
    value.message_count = this.readUint16("big_endian");
    value.messages = [];
    const messages_length = value.message_count ?? this.context?.message_count;
    if (messages_length === void 0) {
      throw new Error('Field-referenced array length field "message_count" not found in value or context');
    }
    for (let i = 0; i < messages_length; i++) {
      let messages_item;
      messages_item = {};
      messages_item.message_id = this.readUint64("big_endian");
      messages_item.channel_id = this.readUint64("big_endian");
      messages_item.subchannel_id = {};
      messages_item.subchannel_id.present = this.readUint8();
      if (messages_item.subchannel_id.present == 1) {
        messages_item.subchannel_id.value = this.readUint64("big_endian");
      }
      messages_item.parent_id = {};
      messages_item.parent_id.present = this.readUint8();
      if (messages_item.parent_id.present == 1) {
        messages_item.parent_id.value = this.readUint64("big_endian");
      }
      messages_item.author_user_id = {};
      messages_item.author_user_id.present = this.readUint8();
      if (messages_item.author_user_id.present == 1) {
        messages_item.author_user_id.value = this.readUint64("big_endian");
      }
      const messages_item_author_nickname_length = this.readUint16("big_endian");
      const messages_item_author_nickname_bytes = [];
      for (let i2 = 0; i2 < messages_item_author_nickname_length; i2++) {
        messages_item_author_nickname_bytes.push(this.readUint8());
      }
      messages_item.author_nickname = new TextDecoder().decode(new Uint8Array(messages_item_author_nickname_bytes));
      const messages_item_content_length = this.readUint16("big_endian");
      const messages_item_content_bytes = [];
      for (let i2 = 0; i2 < messages_item_content_length; i2++) {
        messages_item_content_bytes.push(this.readUint8());
      }
      messages_item.content = new TextDecoder().decode(new Uint8Array(messages_item_content_bytes));
      messages_item.created_at = this.readInt64("big_endian");
      messages_item.edited_at = {};
      messages_item.edited_at.present = this.readUint8();
      if (messages_item.edited_at.present == 1) {
        messages_item.edited_at.value = this.readInt64("big_endian");
      }
      messages_item.thread_depth = this.readUint8();
      messages_item.reply_count = this.readUint32("big_endian");
      value.messages.push(messages_item);
    }
    return value;
  }
}
class PingEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeInt64(value.timestamp, "big_endian");
    return this.finish();
  }
}
class PingDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.timestamp = this.readInt64("big_endian");
    return value;
  }
}
class PongEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeInt64(value.client_timestamp, "big_endian");
    return this.finish();
  }
}
class PongDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.client_timestamp = this.readInt64("big_endian");
    return value;
  }
}
class Error_Encoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint16(value.error_code, "big_endian");
    const value_message_bytes = new TextEncoder().encode(value.message);
    this.writeUint16(value_message_bytes.length, "big_endian");
    for (const byte of value_message_bytes) {
      this.writeUint8(byte);
    }
    return this.finish();
  }
}
class Error_Decoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.error_code = this.readUint16("big_endian");
    const message_length = this.readUint16("big_endian");
    const message_bytes = [];
    for (let i = 0; i < message_length; i++) {
      message_bytes.push(this.readUint8());
    }
    value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
    return value;
  }
}
class ServerConfigEncoder extends BitStreamEncoder {
  constructor() {
    super("msb_first");
    this.compressionDict = /* @__PURE__ */ new Map();
  }
  encode(value) {
    this.compressionDict.clear();
    this.writeUint8(value.protocol_version);
    this.writeUint16(value.max_message_rate, "big_endian");
    this.writeUint16(value.max_channel_creates, "big_endian");
    this.writeUint16(value.inactive_cleanup_days, "big_endian");
    this.writeUint8(value.max_connections_per_ip);
    this.writeUint32(value.max_message_length, "big_endian");
    this.writeUint16(value.max_thread_subs, "big_endian");
    this.writeUint16(value.max_channel_subs, "big_endian");
    this.writeUint8(value.directory_enabled);
    return this.finish();
  }
}
class ServerConfigDecoder extends BitStreamDecoder {
  constructor(bytes, context) {
    super(bytes, "msb_first");
    this.context = context;
  }
  decode() {
    const value = {};
    value.protocol_version = this.readUint8();
    value.max_message_rate = this.readUint16("big_endian");
    value.max_channel_creates = this.readUint16("big_endian");
    value.inactive_cleanup_days = this.readUint16("big_endian");
    value.max_connections_per_ip = this.readUint8();
    value.max_message_length = this.readUint32("big_endian");
    value.max_thread_subs = this.readUint16("big_endian");
    value.max_channel_subs = this.readUint16("big_endian");
    value.directory_enabled = this.readUint8();
    return value;
  }
}
export {
  AuthRequestDecoder,
  AuthRequestEncoder,
  AuthResponseDecoder,
  AuthResponseEncoder,
  ChannelDecoder,
  ChannelEncoder,
  ChannelListDecoder,
  ChannelListEncoder,
  Error_Decoder,
  Error_Encoder,
  FrameHeaderDecoder,
  FrameHeaderEncoder,
  JoinChannelDecoder,
  JoinChannelEncoder,
  JoinResponseDecoder,
  JoinResponseEncoder,
  ListChannelsDecoder,
  ListChannelsEncoder,
  ListMessagesDecoder,
  ListMessagesEncoder,
  MessageDecoder,
  MessageEncoder,
  MessageListDecoder,
  MessageListEncoder,
  MessagePostedDecoder,
  MessagePostedEncoder,
  NewMessageDecoder,
  NewMessageEncoder,
  NicknameResponseDecoder,
  NicknameResponseEncoder,
  PingDecoder,
  PingEncoder,
  PongDecoder,
  PongEncoder,
  PostMessageDecoder,
  PostMessageEncoder,
  RegisterResponseDecoder,
  RegisterResponseEncoder,
  RegisterUserDecoder,
  RegisterUserEncoder,
  ServerConfigDecoder,
  ServerConfigEncoder,
  SetNicknameDecoder,
  SetNicknameEncoder,
  StringDecoder,
  StringEncoder
};
