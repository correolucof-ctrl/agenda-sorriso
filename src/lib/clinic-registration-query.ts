import { queryOptions } from "@tanstack/react-query";
import { getClinicRegistration } from "@/lib/clinic-registration.functions";

export const clinicRegistrationOptions = () => queryOptions({
  queryKey: ["clinic-registration"],
  queryFn: () => getClinicRegistration(),
  staleTime: 60_000,
});