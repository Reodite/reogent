import { connectDatabase } from "../db";
import {
  BuildingFavorite,
  Counter,
  DegreePlan,
  Message,
  OAuthAccount,
  PulseQuestion,
  PulseRound,
  PulseVote,
  Schedule,
  Session,
  SharerGroup,
  SharerGroupMember,
  SharerPerson,
  User,
  UserProfile,
} from "./models";

/** Connects to MongoDB and creates the indexes required by persistence operations. */
export async function migrate(): Promise<void> {
  await connectDatabase();
  await Promise.all([
    BuildingFavorite.createIndexes(),
    Counter.createIndexes(),
    DegreePlan.createIndexes(),
    Message.createIndexes(),
    OAuthAccount.createIndexes(),
    PulseQuestion.createIndexes(),
    PulseRound.createIndexes(),
    PulseVote.createIndexes(),
    Schedule.createIndexes(),
    Session.createIndexes(),
    SharerGroup.createIndexes(),
    SharerGroupMember.createIndexes(),
    SharerPerson.createIndexes(),
    User.createIndexes(),
    UserProfile.createIndexes(),
  ]);
}
