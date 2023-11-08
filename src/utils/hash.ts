import bcrypt from 'bcryptjs';
const saltRounds = 10;

export const encrypt = async (password: string): Promise<string | null> => {
  try {
    const salt = await bcrypt.genSalt(saltRounds);
    const hash = await bcrypt.hash(password, salt);

    return hash;
  } catch (e) {
    console.log('encrypt error ===>', e);
    return null;
  }
};

export const compareHash = async (plainPass: string, hashword: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(plainPass, hashword);
  } catch (e) {
    return false;
  }
};
