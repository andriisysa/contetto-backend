import { randomInt } from 'crypto';

export const delay = async (seconds: number) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(''), seconds * 1000);
  });

export const getNow = () => {
  return Math.floor(new Date().getTime() / 1000);
};

export const getRandomDigits = (digits: number) => {
  if (!digits) return '';
  return String(randomInt(Math.pow(10, digits - 1), Math.pow(10, digits) - 1));
};
