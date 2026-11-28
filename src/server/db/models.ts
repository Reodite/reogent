import { randomUUID } from "node:crypto";
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    _id: { type: String, default: randomUUID },
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    tokensSpent: { type: Number, default: 0, min: 0 },
    tokenTrackingStartedAt: { type: Date, default: Date.now },
    chatDay: { type: String, default: null },
    chatMessages: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);

const sessionSchema = new Schema(
  {
    _id: { type: String, default: randomUUID },
    userId: { type: String, required: true, index: true },
    title: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    nextMessageOrder: { type: Number, default: 0 },
  },
  { versionKey: false },
);

const messageSchema = new Schema(
  {
    _id: { type: String, default: randomUUID },
    sessionId: { type: String, required: true },
    order: { type: Number, required: true },
    role: { type: String, required: true, enum: ["user", "assistant"] },
    content: { type: String, required: true },
    activity: { type: Schema.Types.Mixed, default: null },
    citations: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
messageSchema.index({ sessionId: 1, order: 1 }, { unique: true });

const oauthAccountSchema = new Schema(
  {
    _id: { type: String, default: randomUUID },
    userId: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    providerSubject: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    email: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    profileUpdatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
oauthAccountSchema.index({ provider: 1, providerSubject: 1 }, { unique: true });
oauthAccountSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true }, name: "oauth_one_primary_user" },
);

const profileSchema = new Schema(
  {
    _id: { type: String },
    data: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
const scheduleSchema = new Schema(
  {
    _id: { type: String },
    data: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
const degreePlanSchema = new Schema(
  {
    _id: { type: String },
    data: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
const favoriteSchema = new Schema(
  {
    userId: { type: String, required: true },
    buildingCode: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
favoriteSchema.index({ userId: 1, buildingCode: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, createdAt: -1, buildingCode: 1 });

const pulseRoundSchema = new Schema(
  {
    _id: { type: Number },
    title: { type: String, default: null },
    status: { type: String, enum: ["active", "locked"], default: "active" },
    publishedAt: { type: Date, default: Date.now },
    lockedAt: { type: Date, default: null },
    voteRevision: { type: Number, default: 0 },
  },
  { versionKey: false },
);
pulseRoundSchema.index({ status: 1 }, { unique: true, partialFilterExpression: { status: "active" } });
const pulseQuestionSchema = new Schema(
  {
    _id: { type: Number },
    roundId: { type: Number, required: true },
    position: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { versionKey: false },
);
pulseQuestionSchema.index({ roundId: 1, position: 1 }, { unique: true });
const pulseVoteSchema = new Schema(
  {
    questionId: { type: Number, required: true },
    userId: { type: String, required: true },
    agree: { type: Boolean, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
pulseVoteSchema.index({ questionId: 1, userId: 1 }, { unique: true });
pulseVoteSchema.index({ userId: 1 });

const personSchema = new Schema(
  {
    _id: { type: String },
    person: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
const groupSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
const memberSchema = new Schema(
  {
    groupCode: { type: String, required: true },
    userId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
memberSchema.index({ groupCode: 1, userId: 1 }, { unique: true });
memberSchema.index({ userId: 1 });

function model<T>(name: string, schema: Schema): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const User = model<InferSchemaType<typeof userSchema> & { _id: string }>("User", userSchema);
export const Session = model<InferSchemaType<typeof sessionSchema> & { _id: string }>("Session", sessionSchema);
export const Message = model<InferSchemaType<typeof messageSchema> & { _id: string }>("Message", messageSchema);
export const OAuthAccount = model<InferSchemaType<typeof oauthAccountSchema> & { _id: string }>(
  "OAuthAccount",
  oauthAccountSchema,
);
export const UserProfile = model<InferSchemaType<typeof profileSchema> & { _id: string }>("UserProfile", profileSchema);
export const Schedule = model<InferSchemaType<typeof scheduleSchema> & { _id: string }>("Schedule", scheduleSchema);
export const DegreePlan = model<InferSchemaType<typeof degreePlanSchema> & { _id: string }>(
  "DegreePlan",
  degreePlanSchema,
);
export const BuildingFavorite = model<InferSchemaType<typeof favoriteSchema>>("BuildingFavorite", favoriteSchema);
export const PulseRound = model<InferSchemaType<typeof pulseRoundSchema> & { _id: number }>(
  "PulseRound",
  pulseRoundSchema,
);
export const PulseQuestion = model<InferSchemaType<typeof pulseQuestionSchema> & { _id: number }>(
  "PulseQuestion",
  pulseQuestionSchema,
);
export const PulseVote = model<InferSchemaType<typeof pulseVoteSchema>>("PulseVote", pulseVoteSchema);
export const SharerPerson = model<InferSchemaType<typeof personSchema> & { _id: string }>("SharerPerson", personSchema);
export const SharerGroup = model<InferSchemaType<typeof groupSchema> & { _id: string }>("SharerGroup", groupSchema);
export const SharerGroupMember = model<InferSchemaType<typeof memberSchema>>("SharerGroupMember", memberSchema);

export const Counter = model<{ _id: string; value: number }>(
  "Counter",
  new Schema({ _id: { type: String }, value: { type: Number, default: 0 } }, { versionKey: false }),
);
