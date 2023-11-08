import jwt from 'jsonwebtoken';

//life is for 2 hours for the token then refresh
export function generateTokens(user: any): string | null {
  if (user.iat) delete user.iat;
  if (user.exp) delete user.exp;

  const secret: string | undefined = process.env.JWT_SECRET;

  if (secret) {
    const access_token = jwt.sign(user, secret, { expiresIn: '60s' });
    const refresh_token = jwt.sign(user, secret, { expiresIn: '2h' });
    return `${access_token} ${refresh_token}`;
  } else {
    console.log('JWT_SECRET is not defined');
    return null;
  }
}

export function verifyToken(token: string): any {
  const secret: string | undefined = process.env.JWT_SECRET;

  if (secret) {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      return null;
    }
  } else {
    console.log('JWT_SECRET is not defined');
    return null;
  }
}
