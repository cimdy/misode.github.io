import { CollectionRegistry } from '@mcschema/core'
import { BlockStateRegistry, checkVersion } from './App'
import config from '../config.json'

const CACHE_FORMAT = 1

type VersionConfig = {
  id: string,
  mcdata_ref: string
}

type RegistryConfig = {
  id: string
  minVersion?: string
  maxVersion?: string
  path?: string
}

const localStorageCache = (version: string) => `cache_${version}`
declare var __MCDATA_MASTER_HASH__: string;

const baseUrl = 'https://raw.githubusercontent.com/Arcensoth/mcdata'
const mcdata = (ref: string, registry: string) => {
  return `${baseUrl}/${ref}/processed/reports/registries/${registry}/data.min.json`
}

export const fetchData = async (target: CollectionRegistry, versionId: string) => {
  const version = config.versions.find(v => v.id === versionId)
  if (!version) return

  const cache = JSON.parse(localStorage.getItem(localStorageCache(versionId)) ?? '{}')
  const cacheValid = cache.format === CACHE_FORMAT && (version.mcdata_ref !== 'master' || cache.mcdata_hash === __MCDATA_MASTER_HASH__)

  await Promise.all([
    fetchRegistries(target, version, cache, cacheValid),
    fetchBlockStateMap(version, cache, cacheValid)
  ])

  if (!cacheValid) {
    if (version.mcdata_ref === 'master') {
      cache.mcdata_hash = __MCDATA_MASTER_HASH__
    }
    cache.format = CACHE_FORMAT
    localStorage.setItem(localStorageCache(versionId), JSON.stringify(cache))
  }
}

const fetchRegistries = async (target: CollectionRegistry, version: VersionConfig, cache: any, cacheValid: boolean) => {
  if (cacheValid && cache.registries) {
    config.registries.forEach((r: string | RegistryConfig) => {
      if (typeof r === 'string') r = { id: r }
      if (!checkVersion(version.id, r.minVersion, r.maxVersion)) return

      target.register(r.id, cache.registries[r.id])
    })
    return
  }

  cache.registries = {}
  if (checkVersion('1.15', version.id)) {
    const url = `${baseUrl}/${version.mcdata_ref}/generated/reports/registries.json`
    try {
      const res = await fetch(url)
      const data = await res.json()
      config.registries.forEach(async (r: string | RegistryConfig) => {
        if (typeof r === 'string') r = { id: r }
        if (!checkVersion(version.id, r.minVersion, r.maxVersion)) return

        const values = Object.keys(data[`minecraft:${r.id}`].entries)
        target.register(r.id, values)
        cache.registries[r.id] = values
      })
    } catch (e) {
      console.warn(`Error occurred while fetching registries for version ${version.id}`)
    }
  } else {
    await Promise.all(config.registries.map(async (r: string | RegistryConfig) => {
      if (typeof r === 'string') r = { id: r }
      if (!checkVersion(version.id, r.minVersion, r.maxVersion)) return
  
      const url = r.path
        ? `${baseUrl}/${version.mcdata_ref}/${r.path}/data.min.json`
        : mcdata(version.mcdata_ref, typeof r === 'string' ? r : r.id)
  
      try {
        const res = await fetch(url)
        const data = await res.json()
  
        target.register(r.id, data.values)
        cache.registries[r.id] = data.values
      } catch (e) {
        console.warn(`Error occurred while fetching registry "${r.id}":`, e)
      }
    }))
  }
}

const fetchBlockStateMap = async (version: VersionConfig, cache: any, cacheValid: boolean) => {
  if (cacheValid && cache.block_state_map) {
    Object.keys(cache.block_state_map).forEach(block => {
      BlockStateRegistry[block] = cache.block_state_map[block]
    })
    return
  }

  cache.block_state_map = {}
  const url = (checkVersion(version.id, undefined, '1.15'))
    ? `${baseUrl}/${version.mcdata_ref}/generated/reports/blocks.json`
    : `${baseUrl}/${version.mcdata_ref}/processed/reports/blocks/data.min.json`

  const res = await fetch(url)
  const data = await res.json()

  Object.keys(data).forEach(block => {
    const res = {
      properties: data[block].properties,
      default: data[block].states.find((s: any) => s.default).properties
    }
    BlockStateRegistry[block] = res
    cache.block_state_map[block] = res
  })
}
