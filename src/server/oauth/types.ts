export interface OAuthProviderConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

export interface OAuthStart {
  url: string;
  state: string;
  verifier: string;
}

export interface OAuthIdentity {
  subject: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  avatarUrl?: string;
}

/** Exchanges authorization codes and validates provider identities before normalization. */
export interface OAuthProvider {
  id: string;
  getConfig(): OAuthProviderConfig | null;
  start(config: OAuthProviderConfig): OAuthStart;
  finish(config: OAuthProviderConfig, code: string, verifier: string): Promise<OAuthIdentity>;
}
