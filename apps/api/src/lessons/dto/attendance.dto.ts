import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  ATTENDANCE_STATUSES,
  AttendanceStatus,
} from '../../common/constants/enums';

export class AttendanceDto {
  // Defaults to the current user when omitted (e.g. student marking themselves).
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(ATTENDANCE_STATUSES as unknown as string[])
  status?: AttendanceStatus;
}
