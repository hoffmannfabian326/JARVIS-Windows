use serde::Serialize;
#[derive(Serialize)]
pub struct InputDevice {
    pub id: String,
    pub name: String,
}
#[derive(Serialize)]
pub struct InputDevices {
    pub devices: Vec<InputDevice>,
    pub default_id: Option<String>,
}
#[tauri::command]
pub fn voice_devices() -> Result<InputDevices, String> {
    inventory()
}
pub fn inventory() -> Result<InputDevices, String> {
    #[cfg(not(windows))]
    {
        Ok(InputDevices {
            devices: vec![],
            default_id: None,
        })
    }
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        #[repr(C)]
        struct Caps {
            mid: u16,
            pid: u16,
            version: u32,
            name: [u16; 32],
            formats: u32,
            channels: u16,
            reserved: u16,
        }
        #[link(name = "winmm")]
        extern "system" {
            fn waveInGetNumDevs() -> u32;
            fn waveInGetDevCapsW(device: usize, caps: *mut Caps, size: u32) -> u32;
            fn waveInMessage(device: *mut c_void, message: u32, first: usize, second: usize)
                -> u32;
        }
        let mut devices = vec![];
        let mut preferred = u32::MAX;
        let mut flags = 0u32;
        // Queries neither open nor record a microphone.
        let preferred_known = unsafe {
            waveInMessage(
                u32::MAX as usize as *mut c_void,
                0x2000 + 21,
                &mut preferred as *mut u32 as usize,
                &mut flags as *mut u32 as usize,
            ) == 0
        };
        let count = unsafe { waveInGetNumDevs() };
        for i in 0..count {
            let mut caps = Caps {
                mid: 0,
                pid: 0,
                version: 0,
                name: [0; 32],
                formats: 0,
                channels: 0,
                reserved: 0,
            };
            if unsafe {
                waveInGetDevCapsW(i as usize, &mut caps, std::mem::size_of::<Caps>() as u32)
            } != 0
            {
                return Err("Mikrofonliste nicht zuverlässig lesbar. Geräte erneut prüfen.".into());
            }
            let length = caps.name.iter().position(|v| *v == 0).unwrap_or(32);
            let name = String::from_utf16_lossy(&caps.name[..length]);
            devices.push(InputDevice {
                id: format!("{i}:{name}"),
                name,
            });
        }
        let default_id = preferred_known
            .then(|| devices.get(preferred as usize).map(|d| d.id.clone()))
            .flatten();
        Ok(InputDevices {
            devices,
            default_id,
        })
    }
}

#[cfg(all(test,windows))]
mod windows_inventory_tests {
    #[test]
    fn device_inventory_reads_windows_without_opening_capture() {
        let inventory=super::inventory().expect("Windows WinMM inventory must be readable");
        let mut ids=std::collections::HashSet::new();
        for device in &inventory.devices { assert!(ids.insert(&device.id));assert!(!device.name.is_empty()); }
        if let Some(default)=&inventory.default_id {assert!(inventory.devices.iter().any(|d|&d.id==default));}
        println!("Native WinMM input devices: {}; default resolved: {}. No microphone opened.",inventory.devices.len(),inventory.default_id.is_some());
    }
}
