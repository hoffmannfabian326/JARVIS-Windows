/* Synthetic WinMM ABI boundary for AudioCapture contract tests. Opens no device. */
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#ifdef _WIN32
#define API __declspec(dllexport)
#else
#define API __attribute__((visibility("default")))
#endif
typedef struct {uint16_t mid,pid;uint32_t version;uint16_t name[32];uint32_t formats;uint16_t channels,reserved;} Caps;
typedef struct Header {void *data;uint32_t length,recorded;uintptr_t user;uint32_t flags,loops;struct Header *next;uintptr_t reserved;} Header;
typedef void (*Callback)(void*,uint32_t,void*,void*,void*);
static uint32_t starts,closes,devices=1,last_device;
static Callback notify;
static Header *first;
API uint32_t waveInGetNumDevs(void){return devices;}
API uint32_t waveInGetDevCapsW(uintptr_t device,Caps *c,uint32_t size){
 if(device>=devices||size!=sizeof(Caps))return 2;
 memset(c,0,sizeof(*c));c->name[0]='T';c->name[1]='E';c->name[2]='S';c->name[3]='T';c->channels=1;return 0;
}
API uint32_t waveInOpen(void **handle,uint32_t device,void *format,Callback callback,void *instance,uint32_t flags){
 (void)format;(void)instance;(void)flags;last_device=device;notify=callback;first=0;*handle=(void*)1;return 0;
}
API uint32_t waveInPrepareHeader(void *handle,Header *header,uint32_t size){(void)handle;if(size!=sizeof(Header))return 11;header->flags=2;return 0;}
API uint32_t waveInUnprepareHeader(void *handle,Header *header,uint32_t size){(void)handle;(void)header;(void)size;return 0;}
API uint32_t waveInAddBuffer(void *handle,Header *header,uint32_t size){(void)handle;(void)size;if(!first)first=header;return 0;}
API uint32_t waveInStart(void *handle){(void)handle;starts++;return 0;}
API uint32_t waveInStop(void *handle){(void)handle;return 0;}
API uint32_t waveInReset(void *handle){(void)handle;return 0;}
API uint32_t waveInClose(void *handle){(void)handle;closes++;first=0;return 0;}
API uint32_t test_starts(void){return starts;}
API uint32_t test_closes(void){return closes;}
API uint32_t test_device(void){return last_device;}
API void test_reset(uint32_t count){devices=count;starts=closes=0;first=0;}
API void test_frame(void){if(!first||!notify)return;uint8_t *p=(uint8_t*)first->data;p[0]=17;p[1]=34;p[2]=51;p[3]=68;first->recorded=4;notify((void*)1,0x3c0,0,first,0);}
