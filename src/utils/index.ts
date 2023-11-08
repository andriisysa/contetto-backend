export const delay = async (seconds: number) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(''), seconds * 1000);
  });

export const getNow = () => {
  return Math.floor(new Date().getTime() / 1000);
};
