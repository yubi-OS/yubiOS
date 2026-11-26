// SPDX-License-Identifier: LGPL-2.1-or-later
/*
 * yubios-ima-mokvar: minimal freestanding UEFI Boot Service Driver (PE Subsystem 11).
 *
 * systemd-boot loads \EFI\systemd\drivers\*{x64,aa64}.efi before the UKI (src/boot/drivers.c).
 * This driver installs the LINUX_EFI_MOK_VARIABLE_TABLE (c451ed2b-9694-45d3-baba-ed9f8988a389)
 * that shim normally provides, carrying:
 *   MokListRT        = EFI_SIGNATURE_LIST { EFI_CERT_X509_GUID, owner=SHIM_LOCK_GUID, <IMA CA DER> }
 *   MokListTrustedRT = 0x01
 *   <264-byte zero sentinel>
 * Linux v7.3 then loads the CA into .machine (restrict_link_by_ca) and links .machine into
 * .secondary_trusted_keys, so the IMA signer leaf can be keyctl-padd'ed into .ima.
 * Layout: include/linux/efi.h struct efi_mokvar_table_entry {char name[256]; u64 data_size; u8 data[]}
 * validated by drivers/firmware/efi/mokvar-table.c efi_mokvar_table_init().
 *
 * The CA DER is NOT compiled in: the shipped .efi.tmpl carries a "YUBIMOK\0" slot in .data that
 * usr/lib/yubiOS/ima/stage-ima-policy.sh patches with the build's ephemeral IMA CA before the
 * Secure Boot db signature is applied. Rebuild the templates with tools/build-ima-mokvar-templates.sh.
 */
typedef unsigned long long u64; typedef unsigned int u32; typedef unsigned short u16; typedef unsigned char u8;
typedef u64 UINTN; typedef UINTN EFI_STATUS; typedef void *EFI_HANDLE;
#if defined(__x86_64__)
#define EFIAPI __attribute__((ms_abi))
#else
#define EFIAPI
#endif
#define EFI_INVALID_PARAMETER 0x8000000000000002ULL
#define AllocateAnyPages 0
#define EfiRuntimeServicesData 6
#define CA_SLOT_MAX 2036

typedef struct { u32 d1; u16 d2, d3; u8 d4[8]; } EFI_GUID;
typedef struct { u64 Signature; u32 Revision, HeaderSize, CRC32, Reserved; } EFI_TABLE_HEADER;
typedef struct {
	EFI_TABLE_HEADER Hdr;
	void *RaiseTPL, *RestoreTPL;
	EFI_STATUS (EFIAPI *AllocatePages)(u32 Type, u32 MemoryType, UINTN Pages, u64 *Memory);
	void *FreePages, *GetMemoryMap, *AllocatePool, *FreePool, *CreateEvent, *SetTimer,
	     *WaitForEvent, *SignalEvent, *CloseEvent, *CheckEvent, *InstallProtocolInterface,
	     *ReinstallProtocolInterface, *UninstallProtocolInterface, *HandleProtocol, *Reserved,
	     *RegisterProtocolNotify, *LocateHandle, *LocateDevicePath;
	EFI_STATUS (EFIAPI *InstallConfigurationTable)(EFI_GUID *Guid, void *Table);
} EFI_BOOT_SERVICES;
typedef struct {
	EFI_TABLE_HEADER Hdr; void *FirmwareVendor; u32 FirmwareRevision;
	void *ConsoleInHandle, *ConIn, *ConsoleOutHandle, *ConOut, *StandardErrorHandle, *StdErr, *RuntimeServices;
	EFI_BOOT_SERVICES *BootServices; UINTN NumberOfTableEntries; void *ConfigurationTable;
} EFI_SYSTEM_TABLE;

/* Patch slot. External linkage + used + non-zero initializer keeps it in .data and stops the
 * optimizer from constant-folding the dummy length/bytes into the code. */
struct yubimok_slot { char magic[8]; u32 ca_der_len; u8 ca_der[CA_SLOT_MAX]; };
__attribute__((used, aligned(8))) struct yubimok_slot yubimok_ca = {
	{ 'Y', 'U', 'B', 'I', 'M', 'O', 'K', '\0' }, 0xFFFFFFFFu, { [0 ... CA_SLOT_MAX - 1] = 0xA5 }
};

static EFI_GUID mokvar_guid = { 0xc451ed2b, 0x9694, 0x45d3, { 0xba, 0xba, 0xed, 0x9f, 0x89, 0x88, 0xa3, 0x89 } };
static const u8 cert_x509_guid[16] = { 0xa1,0x59,0xc0,0xa5, 0xe4,0x94, 0xa7,0x4a, 0x87,0xb5,0xab,0x15,0x5c,0x2b,0xf0,0x72 };
static const u8 shim_lock_guid[16] = { 0x50,0xab,0x5d,0x60, 0x46,0xe0, 0x00,0x43, 0xab,0xb6,0x3d,0xd8,0x10,0xdd,0x8b,0x23 };

static u8 *put(u8 *p, const volatile u8 *s, UINTN n) { while (n--) *p++ = *s++; return p; }
static u8 *zero(u8 *p, UINTN n) { while (n--) *p++ = 0; return p; }
static u8 *name(u8 *p, const char *s) { UINTN i = 0; for (; s[i]; i++) p[i] = (u8)s[i]; zero(p + i, 256 - i); return p + 256; }
static u8 *le32(u8 *p, u32 v) { for (int i = 0; i < 4; i++) *p++ = (u8)(v >> (8 * i)); return p; }
static u8 *le64(u8 *p, u64 v) { for (int i = 0; i < 8; i++) *p++ = (u8)(v >> (8 * i)); return p; }

EFI_STATUS EFIAPI EfiMain(EFI_HANDLE image, EFI_SYSTEM_TABLE *st)
{
	(void)image;
	volatile struct yubimok_slot *slot = &yubimok_ca;
	u32 len = slot->ca_der_len;
	/* Unpatched template (0xFFFFFFFF) or bogus length: refuse, install nothing. A DER cert starts 0x30. */
	if (len < 64 || len > CA_SLOT_MAX || slot->ca_der[0] != 0x30)
		return EFI_INVALID_PARAMETER;
	u32 sig_size = 16 + len, esl_size = 28 + sig_size;
	UINTN total = (264 + esl_size) + (264 + 1) + 264;
	u64 addr = 0;
	EFI_STATUS s = st->BootServices->AllocatePages(AllocateAnyPages, EfiRuntimeServicesData, (total + 4095) / 4096, &addr);
	if (s)
		return s;
	u8 *p = (u8 *)(UINTN)addr;
	p = name(p, "MokListRT"); p = le64(p, esl_size);
	p = put(p, cert_x509_guid, 16); p = le32(p, esl_size); p = le32(p, 0); p = le32(p, sig_size);
	p = put(p, shim_lock_guid, 16); p = put(p, slot->ca_der, len);
	p = name(p, "MokListTrustedRT"); p = le64(p, 1); *p++ = 1;
	zero(p, 264);
	return st->BootServices->InstallConfigurationTable(&mokvar_guid, (void *)(UINTN)addr);
}
