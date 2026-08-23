import { PartialType } from '@nestjs/swagger';
import { CreateTransitionDto } from './create-transition.dto';

export class UpdateTransitionDto extends PartialType(CreateTransitionDto) {}
