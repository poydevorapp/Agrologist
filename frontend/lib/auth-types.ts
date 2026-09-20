export type PublicUser = {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  status: string;
  roles: Array<'FARMER' | 'BUYER' | 'TRANSPORTER' | 'ADMIN'>;
};

export type AuthSession = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
  refreshExpiresIn: number;
};

export type LoginInput = { identifier: string; password: string };
export type RegisterInput = {
  phone: string;
  email?: string;
  fullName: string;
  password: string;
  roles: Array<'FARMER' | 'BUYER' | 'TRANSPORTER'>;
  region?: string;
  district?: string;
};
