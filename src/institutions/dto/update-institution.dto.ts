import { PartialType } from '@nestjs/swagger';
import { CreateInstitutionDto } from './create-institution.dto.js';

export class UpdateInstitutionDto extends PartialType(CreateInstitutionDto) {}
