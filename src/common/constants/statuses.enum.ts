export enum ClassroomStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export enum ClassroomEndedReason {
  HOST_ENDED = 'HOST_ENDED',
  INACTIVITY = 'INACTIVITY',
}

export enum ParticipantStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  LEFT = 'LEFT',
}

export enum WhiteboardOperationType {
  DRAW = 'DRAW',
  ERASE = 'ERASE',
}
