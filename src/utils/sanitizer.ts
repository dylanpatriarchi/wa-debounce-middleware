import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';

const phoneUtil = PhoneNumberUtil.getInstance();

export const sanitizePhoneNumber = (phoneNumber: string): string => {
    try {
        // Basic cleanup: remove everything that's not a digit or a plus sign
        // If it doesn't start with +, we might need to assume a default region or check context.
        // However, WhatsApp usually sends full international format without '+', e.g., "15551234567"
        // So we will try adding '+' if missing and valid.

        // WhatsApp usually provides `wa_id` which is the phone number. 
        // It often comes as "16505551234" (CC + Number).

        let rawNumber = phoneNumber;
        if (!rawNumber.startsWith('+')) {
            rawNumber = '+' + rawNumber;
        }

        const number = phoneUtil.parse(rawNumber);
        if (phoneUtil.isValidNumber(number)) {
            return phoneUtil.format(number, PhoneNumberFormat.E164);
        }

        // Fallback if parsing fails but it looks like a number: return original with +
        return rawNumber;
    } catch (error) {
        console.error(`Error sanitizing phone number ${phoneNumber}:`, error);
        return phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;
    }
};
