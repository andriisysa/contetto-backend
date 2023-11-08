import type { ValidationError as expressValidationError } from 'express-validator';

export class ErrorBase extends Error {
  public readonly statusCode: number;

  public readonly msg: string;

  public readonly name: string;

  constructor(statusCode: number, msg: string, name: string) {
    super();
    this.name = name;
    this.msg = msg;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends ErrorBase {
  errors: expressValidationError[];

  constructor(errors: expressValidationError[]) {
    super(400, 'Validation Error', 'Validation Error');

    this.errors = errors;
  }
}
