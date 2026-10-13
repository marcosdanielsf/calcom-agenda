import dayjs from "@calcom/dayjs";
import { DatePicker } from "@calcom/ui/components/form";
import { useEffect, useState } from "react";

interface WeekPickerProps {
  anchor: dayjs.Dayjs;
  label: string;
  onDateChange: (date: dayjs.Dayjs) => void;
}

export function WeekPicker({ anchor, label, onDateChange }: WeekPickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(anchor.toDate());
  const anchorKey = anchor.format("YYYY-MM-DD");
  useEffect(() => {
    setSelectedDate(dayjs(anchorKey).toDate());
  }, [anchorKey]);

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    onDateChange(dayjs(date).startOf("day"));
  };

  return (
    <DatePicker
      date={selectedDate}
      onDatesChange={handleDateChange}
      minDate={null}
      label={label}
      className="[&_button]:min-h-10"
    />
  );
}
