import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ImportSourceType, ReviewStatus } from '@prisma/client';
import { AMOUNT_REGEX } from '../common/dto';

export class UploadImportDto {
  @IsIn(Object.values(ImportSourceType))
  sourceType: ImportSourceType;

  @IsOptional()
  @IsUUID('all')
  accountId?: string;
}

export class UpdateImportJobDto {
  @IsOptional()
  @IsUUID('all')
  accountId?: string;
}

export class ReceiptItemDto {
  @IsString()
  @MaxLength(255)
  itemName: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lineTotal: number;
}

/** Field hasil ekstraksi yang dapat dikoreksi pengguna saat review. */
export class RecordDataDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE', 'TRANSFER']) type?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  @IsOptional() @Matches(AMOUNT_REGEX) amount?: string;
  @IsOptional() @IsUUID('all') accountId?: string | null;
  @IsOptional() @IsUUID('all') categoryId?: string | null;
  /** Untuk TRANSFER: akun lawan (tujuan bila debit, asal bila kredit) */
  @IsOptional() @IsUUID('all') counterpartAccountId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) merchant?: string | null;
  @IsOptional() @IsString() @MaxLength(100) receiptNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(100) paymentMethod?: string | null;
  @IsOptional() @Matches(AMOUNT_REGEX) subtotal?: string | null;
  @IsOptional() @Matches(AMOUNT_REGEX) discount?: string | null;
  @IsOptional() @Matches(AMOUNT_REGEX) tax?: string | null;
  @IsOptional() @Matches(AMOUNT_REGEX) otherFees?: string | null;
}

export class UpdateRecordDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RecordDataDto)
  data?: RecordDataDto;

  @IsOptional()
  @IsIn(Object.values(ReviewStatus))
  reviewStatus?: ReviewStatus;

  /** Ganti seluruh rincian item struk */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  items?: ReceiptItemDto[];
}

export class BulkUpdateRecordsDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  recordIds: string[];

  @IsOptional()
  @IsIn(Object.values(ReviewStatus))
  reviewStatus?: ReviewStatus;

  @IsOptional()
  @IsUUID('all')
  categoryId?: string;
}
