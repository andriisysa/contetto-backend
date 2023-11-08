import type { Request, Response, NextFunction } from 'express';
import { validationResult, type ValidationChain, ValidationError as expressValidationError } from 'express-validator';
import { ErrorBase, ValidationError } from '../types/error.types';

const error = (err: Error, res: Response) => {
  if (err instanceof ErrorBase) {
    let response = {
      name: err.name,
      errors: [] as expressValidationError[],
      msg: err.msg,
    };

    if (err instanceof ValidationError) {
      response = {
        name: err.name,
        errors: err.errors,
        msg: err.msg,
      };
    }

    res.status(err.statusCode).json(response);
  } else {
    res.status(500).json({
      name: 'Unexpected Error',
      msg: 'Unexpected Error',
    });
  }
};

const validate = (validations: ValidationChain[]) => async (req: Request, res: Response, next: NextFunction) => {
  await Promise.all(validations.map((validation) => validation.run(req)));

  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  error(new ValidationError(errors.array()), res);
};

export default validate;
