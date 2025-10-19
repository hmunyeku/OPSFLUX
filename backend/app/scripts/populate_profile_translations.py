"""
Script pour peupler les traductions de la page profil utilisateur.
"""

import json
import sys
import uuid
from sqlmodel import Session, select

# Add parent directory to path to import app modules
sys.path.append("/app")

from app.core.db import engine
from app.models_i18n import Language, TranslationNamespace, Translation


PROFILE_TRANSLATIONS_EN = {
    "core.profile.tabs.profile": "Profile",
    "core.profile.tabs.profile_mobile": "Profile",
    "core.profile.tabs.preferences": "Preferences",
    "core.profile.tabs.preferences_mobile": "Pref.",
    "core.profile.tabs.informations": "Information",
    "core.profile.tabs.informations_mobile": "Info",
    "core.profile.tabs.api": "API",

    # Form
    "core.profile.form.title": "Personal Information",
    "core.profile.form.description": "Update your profile information",
    "core.profile.form.loading": "Loading...",

    # Fields
    "core.profile.form.fields.avatar.label": "Profile Picture",
    "core.profile.form.fields.avatar.helper": "Visible to other users",
    "core.profile.form.fields.first_name.label": "First Name",
    "core.profile.form.fields.first_name.placeholder": "John",
    "core.profile.form.fields.last_name.label": "Last Name",
    "core.profile.form.fields.last_name.placeholder": "Doe",
    "core.profile.form.fields.initials.label": "Initials",
    "core.profile.form.fields.initials.placeholder": "JD",
    "core.profile.form.fields.initials.helper": "Displayed in avatar",
    "core.profile.form.fields.email.label": "Email Address",
    "core.profile.form.fields.email.placeholder": "john.doe@example.com",
    "core.profile.form.fields.email.helper": "Login email (cannot be changed)",
    "core.profile.form.fields.recovery_email.label": "Recovery Email",
    "core.profile.form.fields.recovery_email.placeholder": "recovery@example.com",
    "core.profile.form.fields.recovery_email.helper": "To recover your account",
    "core.profile.form.fields.intranet_id.label": "Intranet Identifier",
    "core.profile.form.fields.intranet_id.placeholder": "user123",
    "core.profile.form.fields.intranet_id.helper": "Your identifier on the company intranet",
    "core.profile.form.fields.intranet_id.access": "Access my intranet",
    "core.profile.form.fields.phone_numbers.label": "Phone Numbers",
    "core.profile.form.fields.phone_numbers.placeholder": "+1 234 567 8900",
    "core.profile.form.fields.phone_numbers.helper": "Add one or more phone numbers",

    # Password
    "core.profile.form.password.title": "Password",
    "core.profile.form.password.description": "Change your password to secure your account",
    "core.profile.form.password.current": "Current Password",
    "core.profile.form.password.current_placeholder": "Enter your current password",
    "core.profile.form.password.new": "New Password",
    "core.profile.form.password.new_placeholder": "Enter your new password",
    "core.profile.form.password.confirm": "Confirm Password",
    "core.profile.form.password.confirm_placeholder": "Confirm your new password",
    "core.profile.form.password.show": "Show",
    "core.profile.form.password.hide": "Hide",
    "core.profile.form.password.mismatch": "Passwords do not match",
    "core.profile.form.password.strength": "Password Strength",
    "core.profile.form.password.strength_weak": "Weak",
    "core.profile.form.password.strength_medium": "Medium",
    "core.profile.form.password.strength_strong": "Strong",
    "core.profile.form.password.requirements": "Requirements:",
    "core.profile.form.password.req_length": "At least {count} characters",
    "core.profile.form.password.req_uppercase": "One uppercase letter",
    "core.profile.form.password.req_lowercase": "One lowercase letter",
    "core.profile.form.password.req_digit": "One digit",
    "core.profile.form.password.req_special": "One special character",

    # Validation
    "core.profile.form.validation.first_name_min": "First name must be at least 2 characters",
    "core.profile.form.validation.first_name_max": "First name must not exceed 100 characters",
    "core.profile.form.validation.last_name_min": "Last name must be at least 2 characters",
    "core.profile.form.validation.last_name_max": "Last name must not exceed 100 characters",
    "core.profile.form.validation.initials_max": "Initials must not exceed 10 characters",
    "core.profile.form.validation.email_required": "Email is required",
    "core.profile.form.validation.email_invalid": "Invalid email",
    "core.profile.form.validation.recovery_email_invalid": "Invalid recovery email",

    # Actions
    "core.profile.form.actions.update": "Update Profile",
    "core.profile.form.actions.updating": "Updating...",
    "core.profile.form.actions.change_password": "Change Password",
    "core.profile.form.actions.changing": "Changing...",

    # Toast
    "core.profile.form.toast.fields_required": "Required fields",
    "core.profile.form.toast.fields_required_desc": "Please fill in all fields",
    "core.profile.form.toast.password_mismatch": "Error",
    "core.profile.form.toast.password_mismatch_desc": "New passwords do not match",
    "core.profile.form.toast.password_weak": "Password too weak",
    "core.profile.form.toast.password_weak_desc": "Please choose a stronger password",
    "core.profile.form.toast.password_changed": "Password changed",
    "core.profile.form.toast.password_changed_desc": "Your password has been changed successfully",
    "core.profile.form.toast.profile_updated": "Profile updated",
    "core.profile.form.toast.profile_updated_desc": "Your information has been updated successfully",
    "core.profile.form.toast.error": "Error",
    "core.profile.form.toast.error_auth": "You must be logged in",
    "core.profile.form.toast.error_update": "An error occurred while updating the profile",
    "core.profile.form.toast.error_password": "Unable to change password",
    "core.profile.form.toast.error_generic": "An error occurred",

    # Informations
    "core.profile.informations.role_group.title": "Role and Group",
    "core.profile.informations.role_group.description": "Your role and organizational group",
    "core.profile.informations.role_group.role_label": "Role",
    "core.profile.informations.role_group.role_desc": "Defines your privileges in the system",
    "core.profile.informations.role_group.group_label": "Group",
    "core.profile.informations.role_group.group_desc": "Your organizational group",
    "core.profile.informations.permissions.title": "Permissions",
    "core.profile.informations.permissions.description": "List of permissions granted to your account",
    "core.profile.informations.connection.title": "Connection",
    "core.profile.informations.connection.description": "Information about your last connection",
    "core.profile.informations.connection.last_login": "Last Login",
    "core.profile.informations.connection.last_login_desc": "Date and time of your last login",
    "core.profile.informations.connection.last_activity": "Last Activity",
    "core.profile.informations.connection.last_activity_desc": "Your last action in the system",
    "core.profile.informations.connection.active_sessions": "Active Sessions",
    "core.profile.informations.connection.active_sessions_desc": "Number of currently open sessions",
    "core.profile.informations.connection.session": "session",
    "core.profile.informations.connection.sessions": "sessions",
    "core.profile.informations.stats.title": "Usage Statistics",
    "core.profile.informations.stats.description": "Your system usage statistics",
    "core.profile.informations.stats.total_logins": "Total Logins",
    "core.profile.informations.stats.avg_time": "Average Connection Time",

    # Preferences - 2FA
    "core.profile.preferences.2fa.title": "Two-Factor Authentication (2FA)",
    "core.profile.preferences.2fa.description": "Add an extra layer of security to your account",
    "core.profile.preferences.2fa.enabled_badge": "Enabled",
    "core.profile.preferences.2fa.loading": "Loading...",
    "core.profile.preferences.2fa.status": "2FA Status",
    "core.profile.preferences.2fa.enabled": "Two-factor authentication is enabled",
    "core.profile.preferences.2fa.disabled": "Two-factor authentication is disabled",
    "core.profile.preferences.2fa.primary_method": "Primary Method",
    "core.profile.preferences.2fa.method_totp": "Authenticator App (TOTP)",
    "core.profile.preferences.2fa.method_sms": "SMS",
    "core.profile.preferences.2fa.backup_codes": "Backup Codes",
    "core.profile.preferences.2fa.backup_codes_count": "{count} code(s) available",
    "core.profile.preferences.2fa.regenerate": "Regenerate",
    "core.profile.preferences.2fa.last_used": "Last used: {date}",
    "core.profile.preferences.2fa.setup_dialog.title": "Set Up Two-Factor Authentication",
    "core.profile.preferences.2fa.setup_dialog.description": "Scan the QR code with your authentication app (Google Authenticator, Authy, etc.)",
    "core.profile.preferences.2fa.setup_dialog.manual_key": "If you cannot scan the QR code, manually enter this key:",
    "core.profile.preferences.2fa.setup_dialog.verification_code": "Verification Code",
    "core.profile.preferences.2fa.setup_dialog.verification_placeholder": "000000",
    "core.profile.preferences.2fa.setup_dialog.verification_helper": "Enter the 6-digit code from your app",
    "core.profile.preferences.2fa.setup_dialog.cancel": "Cancel",
    "core.profile.preferences.2fa.setup_dialog.activate": "Activate",
    "core.profile.preferences.2fa.backup_dialog.title": "Backup Codes",
    "core.profile.preferences.2fa.backup_dialog.description": "Keep these codes in a safe place. Each code can only be used once.",
    "core.profile.preferences.2fa.backup_dialog.warning": "⚠️ These codes will only be displayed once. Download or note them now.",
    "core.profile.preferences.2fa.backup_dialog.download": "Download",
    "core.profile.preferences.2fa.backup_dialog.saved": "I have saved my codes",
    "core.profile.preferences.2fa.confirm.disable": "Are you sure you want to disable two-factor authentication?",
    "core.profile.preferences.2fa.confirm.regenerate": "Are you sure you want to regenerate backup codes? Old codes will no longer work.",

    # Preferences - UI
    "core.profile.preferences.search": "Search a preference...",
    "core.profile.preferences.filter": "All Categories",
    "core.profile.preferences.clear_filter": "Clear",
    "core.profile.preferences.no_results": "No preference matches your search.",
    "core.profile.preferences.table.category": "Category",
    "core.profile.preferences.table.preference": "Preference",
    "core.profile.preferences.table.description": "Description",
    "core.profile.preferences.table.value": "Value",
    "core.profile.preferences.table.modified": "Modified",
    "core.profile.preferences.table.filter_tooltip": "Click to remove filter",
    "core.profile.preferences.table.filter_by": "Filter by {category}",

    # Categories
    "core.profile.preferences.categories.appearance": "Appearance",
    "core.profile.preferences.categories.region": "Region",
    "core.profile.preferences.categories.notifications": "Notifications",
    "core.profile.preferences.categories.display": "Display",

    # Items
    "core.profile.preferences.items.color_theme.label": "Color Theme",
    "core.profile.preferences.items.color_theme.desc": "Customize interface colors",
    "core.profile.preferences.items.dark_mode.label": "Display Mode",
    "core.profile.preferences.items.dark_mode.desc": "Choose between light, dark or system",
    "core.profile.preferences.items.dark_mode.light": "Light",
    "core.profile.preferences.items.dark_mode.dark": "Dark",
    "core.profile.preferences.items.dark_mode.system": "System",
    "core.profile.preferences.items.sidebar_collapsed.label": "Collapsed Sidebar",
    "core.profile.preferences.items.sidebar_collapsed.desc": "Collapse sidebar by default",
    "core.profile.preferences.items.sidebar_collapsed.enabled": "Enabled",
    "core.profile.preferences.items.sidebar_collapsed.disabled": "Disabled",
    "core.profile.preferences.items.sidebar_variant.label": "Sidebar Style",
    "core.profile.preferences.items.sidebar_variant.desc": "Choose between floating or inset",
    "core.profile.preferences.items.sidebar_variant.inset": "Inset",
    "core.profile.preferences.items.sidebar_variant.floating": "Floating",
    "core.profile.preferences.items.font_size.label": "Text Size",
    "core.profile.preferences.items.font_size.desc": "Adjust interface text size",
    "core.profile.preferences.items.font_size.small": "Small",
    "core.profile.preferences.items.font_size.normal": "Normal",
    "core.profile.preferences.items.font_size.large": "Large",
    "core.profile.preferences.items.language.label": "Language",
    "core.profile.preferences.items.language.desc": "User interface language",
    "core.profile.preferences.items.timezone.label": "Timezone",
    "core.profile.preferences.items.timezone.desc": "Timezone for date display",
    "core.profile.preferences.items.date_format.label": "Date Format",
    "core.profile.preferences.items.date_format.desc": "Date display format",
    "core.profile.preferences.items.time_format.label": "Time Format",
    "core.profile.preferences.items.time_format.desc": "Time display format",
    "core.profile.preferences.items.time_format.12h": "12 hours",
    "core.profile.preferences.items.time_format.24h": "24 hours",
    "core.profile.preferences.items.email_notifications.label": "Email Notifications",
    "core.profile.preferences.items.email_notifications.desc": "Receive email notifications",
    "core.profile.preferences.items.push_notifications.label": "Push Notifications",
    "core.profile.preferences.items.push_notifications.desc": "Receive browser notifications",
    "core.profile.preferences.items.notification_sound.label": "Notification Sound",
    "core.profile.preferences.items.notification_sound.desc": "Play sound when receiving notifications",
    "core.profile.preferences.items.items_per_page.label": "Items per Page",
    "core.profile.preferences.items.items_per_page.desc": "Number of items displayed per page in lists",

    # Toast
    "core.profile.preferences.toast.error": "Error",
    "core.profile.preferences.toast.error_auth": "You must be logged in",
    "core.profile.preferences.toast.error_setup": "Unable to configure two-factor authentication",
    "core.profile.preferences.toast.error_generic": "An error occurred",
    "core.profile.preferences.toast.code_required": "Code required",
    "core.profile.preferences.toast.code_required_desc": "Please enter the verification code",
    "core.profile.preferences.toast.2fa_enabled": "2FA enabled",
    "core.profile.preferences.toast.2fa_enabled_desc": "Two-factor authentication has been successfully enabled",
    "core.profile.preferences.toast.code_invalid": "Invalid code",
    "core.profile.preferences.toast.code_invalid_desc": "The verification code is incorrect",
    "core.profile.preferences.toast.2fa_disabled": "2FA disabled",
    "core.profile.preferences.toast.2fa_disabled_desc": "Two-factor authentication has been disabled",
    "core.profile.preferences.toast.codes_regenerated": "Codes regenerated",
    "core.profile.preferences.toast.codes_regenerated_desc": "New backup codes have been generated",
    "core.profile.preferences.toast.error_disable": "Unable to disable two-factor authentication",
    "core.profile.preferences.toast.error_regenerate": "Unable to regenerate backup codes",
}


def flatten_dict(d: dict, parent_key: str = "", sep: str = ".") -> dict:
    """Flatten nested dictionary into dot notation keys."""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def main():
    print("🌍 Starting profile translations population...")

    with Session(engine) as session:
        # 1. Get English language (default)
        language = session.exec(
            select(Language).where(Language.code == "en", Language.deleted_at == None)
        ).first()

        if not language:
            print("❌ English language not found!")
            return

        print(f"✅ Found language: {language.name} ({language.code})")

        # 2. Create or get core.profile namespace
        namespace = session.exec(
            select(TranslationNamespace).where(
                TranslationNamespace.code == "core.profile",
                TranslationNamespace.deleted_at == None
            )
        ).first()

        if not namespace:
            namespace = TranslationNamespace(
                id=uuid.uuid4(),
                code="core.profile",
                name="Core - User Profile",
                description="Translations for user profile page (settings)",
                namespace_type="core",
                module_id=None,
            )
            session.add(namespace)
            session.commit()
            session.refresh(namespace)
            print(f"✅ Created namespace: {namespace.code}")
        else:
            print(f"✅ Found namespace: {namespace.code}")

        # 3. Add all translations
        added_count = 0
        updated_count = 0

        for key, value in PROFILE_TRANSLATIONS_EN.items():
            # Check if translation exists
            existing = session.exec(
                select(Translation).where(
                    Translation.namespace_id == namespace.id,
                    Translation.language_id == language.id,
                    Translation.key == key,
                    Translation.deleted_at == None
                )
            ).first()

            if existing:
                # Update if value changed
                if existing.value != value:
                    existing.value = value
                    updated_count += 1
            else:
                # Create new translation
                translation = Translation(
                    id=uuid.uuid4(),
                    namespace_id=namespace.id,
                    language_id=language.id,
                    key=key,
                    value=value,
                )
                session.add(translation)
                added_count += 1

        session.commit()

        print(f"\n✅ Profile translations populated successfully!")
        print(f"   📝 Added: {added_count} new translations")
        print(f"   🔄 Updated: {updated_count} translations")
        print(f"   📊 Total: {len(PROFILE_TRANSLATIONS_EN)} translations")


if __name__ == "__main__":
    main()
